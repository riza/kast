// Package autodj plays a queue of tracks through ffmpeg into an HLS segmenter.
package autodj

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"math/rand/v2"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/riza/kast/internal/library"
)

// Mode controls playback order.
type Mode string

const (
	ModeSequential Mode = "sequential"
	ModeShuffle    Mode = "shuffle"
)

// Player manages AutoDJ playback for one mount.
type Player struct {
	mu           sync.Mutex
	tracks       []*library.Track
	queue        []*library.Track // FIFO one-shot; drained before regular playlist advances
	mode         Mode
	crossfadeMs  int
	current      int
	cancel       context.CancelFunc
	running      bool
	nowPlaying   atomic.Pointer[library.Track]
	onTrackStart func(*library.Track) // called each time a new track begins
	// skipMu guards currentCmd so Skip() can kill it without holding mu.
	skipMu     sync.Mutex
	currentCmd *exec.Cmd
}

// NewPlayer creates a Player with the given track list and mode.
// startFromPath, if non-empty, sets the playback position to the track
// after the one matching that path (resume after restart).
func NewPlayer(tracks []*library.Track, mode Mode, crossfadeMs int, startFromPath string, onTrackStart func(*library.Track)) *Player {
	p := &Player{
		tracks:       tracks,
		mode:         mode,
		crossfadeMs:  crossfadeMs,
		onTrackStart: onTrackStart,
	}
	if mode == ModeShuffle {
		p.shuffle()
	}
	// Resume from the track after the last played one.
	if startFromPath != "" {
		for i, t := range p.tracks {
			if t.Path == startFromPath {
				p.current = (i + 1) % len(p.tracks)
				break
			}
		}
	}
	return p
}

// Start begins playback, piping audio through ffmpegPipe into the HLS segmenter.
// ffmpegPipe must be the stdin of the running ffmpeg HLS process.
func (p *Player) Start(ctx context.Context, ffmpegPipe io.WriteCloser) {
	ctx, cancel := context.WithCancel(ctx)
	p.mu.Lock()
	p.cancel = cancel
	p.running = true
	p.mu.Unlock()

	go p.loop(ctx, ffmpegPipe)
}

// Stop halts playback gracefully.
func (p *Player) Stop() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.cancel != nil {
		p.cancel()
	}
	p.running = false
}

// IsRunning returns whether playback is active.
func (p *Player) IsRunning() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.running
}

// SetTracks replaces the track list mid-play (takes effect at next track boundary).
func (p *Player) SetTracks(tracks []*library.Track) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.tracks = tracks
	p.current = 0
	if p.mode == ModeShuffle {
		p.shuffle()
	}
}

// NowPlaying returns the track currently being played, or nil if idle.
func (p *Player) NowPlaying() *library.Track {
	return p.nowPlaying.Load()
}

// Skip immediately ends the current track and advances to the next one.
func (p *Player) Skip() {
	p.skipMu.Lock()
	cmd := p.currentCmd
	p.skipMu.Unlock()
	if cmd != nil && cmd.Process != nil {
		_ = cmd.Process.Kill() // playTrack returns error → loop continues to next track
	}
}

func (p *Player) loop(ctx context.Context, out io.WriteCloser) {
	defer out.Close()
	defer func() {
		p.nowPlaying.Store(nil)
		p.mu.Lock()
		p.running = false
		p.mu.Unlock()
	}()

	for {
		if ctx.Err() != nil {
			return
		}
		track := p.nextTrack()
		if track == nil {
			slog.Info("autodj: no tracks, stopping")
			return
		}
		p.nowPlaying.Store(track)
		slog.Info("autodj: playing", "title", track.Title, "artist", track.Artist)
		if p.onTrackStart != nil {
			p.onTrackStart(track)
		}
		if err := p.playTrack(ctx, track, out); err != nil {
			if ctx.Err() != nil {
				return
			}
			slog.Warn("autodj: track error", "path", track.Path, "err", err)
			// Continue to next track on error.
		}
	}
}

// playTrack pipes a single audio file to out via ffmpeg.
// ffmpeg re-encodes to PCM pipe for the HLS segmenter to consume.
// Security: path is pre-validated by the library scanner; args are explicit.
func (p *Player) playTrack(ctx context.Context, t *library.Track, out io.Writer) error {
	// Validate the path is still within allowed roots (defence-in-depth).
	for _, part := range strings.Split(filepath.ToSlash(t.Path), "/") {
		if part == ".." {
			return fmt.Errorf("autodj: suspicious path rejected: %s", t.Path)
		}
	}
	if _, err := os.Stat(t.Path); err != nil {
		return fmt.Errorf("autodj: stat %q: %w", t.Path, err)
	}

	// #nosec G204 — filepath.Clean applied; path validated by library scanner.
	cmd := exec.CommandContext(ctx,
		"ffmpeg",
		"-hide_banner",
		"-loglevel", "error",
		"-re",            // read input at native playback rate (real-time)
		"-i", filepath.Clean(t.Path),
		"-vn",        // no video
		"-f", "adts", // raw AAC stream to stdout
		"-c:a", "aac",
		"-b:a", "128k",
		"-ar", "44100",
		"pipe:1",
	)
	cmd.Stdout = out
	cmd.Stderr = os.Stderr

	p.skipMu.Lock()
	p.currentCmd = cmd
	p.skipMu.Unlock()
	defer func() {
		p.skipMu.Lock()
		p.currentCmd = nil
		p.skipMu.Unlock()
	}()

	return cmd.Run()
}

// InsertNext appends t to the one-shot queue. The queue drains before
// nextTrack() advances the regular playlist.
func (p *Player) InsertNext(t *library.Track) {
	p.mu.Lock()
	p.queue = append(p.queue, t)
	p.mu.Unlock()
}

// JumpTo sets playback to tracks[index] and immediately kills the current
// ffmpeg process so the loop picks up the new position.
func (p *Player) JumpTo(index int) {
	p.mu.Lock()
	if index >= 0 && index < len(p.tracks) {
		p.current = index
		p.queue = p.queue[:0] // clear pending queue
	}
	p.mu.Unlock()
	p.skipMu.Lock()
	cmd := p.currentCmd
	p.skipMu.Unlock()
	if cmd != nil && cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
}

// Tracks returns a snapshot of the track list, the ID of the currently
// playing track (empty string if idle), and the pending one-shot queue.
func (p *Player) Tracks() (tracks []*library.Track, nowPlayingID string, queue []*library.Track) {
	p.mu.Lock()
	tracks = append([]*library.Track(nil), p.tracks...)
	queue = append([]*library.Track(nil), p.queue...)
	p.mu.Unlock()
	if np := p.nowPlaying.Load(); np != nil {
		nowPlayingID = np.ID
	}
	return
}

func (p *Player) nextTrack() *library.Track {
	p.mu.Lock()
	defer p.mu.Unlock()
	if len(p.tracks) == 0 {
		return nil
	}
	if len(p.queue) > 0 {
		t := p.queue[0]
		p.queue = p.queue[1:]
		return t
	}
	t := p.tracks[p.current]
	p.current = (p.current + 1) % len(p.tracks)
	// Reshuffle when we loop back to the start in shuffle mode.
	if p.current == 0 && p.mode == ModeShuffle {
		p.shuffle()
	}
	return t
}

func (p *Player) shuffle() {
	rand.Shuffle(len(p.tracks), func(i, j int) {
		p.tracks[i], p.tracks[j] = p.tracks[j], p.tracks[i]
	})
}
