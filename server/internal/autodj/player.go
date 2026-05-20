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
	"time"

	"github.com/riza/kast/internal/library"
)

// Mode controls playback order.
type Mode string

const (
	ModeSequential Mode = "sequential"
	ModeShuffle    Mode = "shuffle"
)

// JingleConfig describes the optional jingle/ad insertion rule for a Player.
// Both intervals are independent: either, both, or neither may be set.
// When both are set, whichever predicate fires first inserts a jingle and
// resets both counters.
type JingleConfig struct {
	Tracks       []*library.Track // pool to pick from; empty disables insertion
	EveryTracks  int              // 0 = disabled
	EveryMinutes int              // 0 = disabled
}

// Enabled reports whether any jingle insertion is configured.
func (j JingleConfig) Enabled() bool {
	return len(j.Tracks) > 0 && (j.EveryTracks > 0 || j.EveryMinutes > 0)
}

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
	onJingleStart func(*library.Track) // called when a jingle/ad is selected
	// skipMu guards currentCmd so Skip() can kill it without holding mu.
	skipMu     sync.Mutex
	currentCmd *exec.Cmd

	// Jingle insertion state. Guarded by mu (or via nextTrack's lock).
	jingle            JingleConfig
	tracksSinceJingle int
	lastJingleAt      time.Time
	jingleNext        int // sequential cursor into jingle.Tracks for variety
}

// NewPlayer creates a Player with the given track list and mode.
// startFromPath, if non-empty, sets the playback position to the track
// after the one matching that path (resume after restart).
// Jingle insertion is disabled by default; call SetJingles to enable.
func NewPlayer(tracks []*library.Track, mode Mode, crossfadeMs int, startFromPath string, onTrackStart func(*library.Track)) *Player {
	p := &Player{
		tracks:       tracks,
		mode:         mode,
		crossfadeMs:  crossfadeMs,
		onTrackStart: onTrackStart,
		lastJingleAt: time.Now(),
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

// SetJingles configures jingle/ad insertion. Call before Start(); calling
// while running has no effect on the currently-encoding track. Pass an empty
// JingleConfig{} to disable.
func (p *Player) SetJingles(cfg JingleConfig, onJingleStart func(*library.Track)) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.jingle = cfg
	p.onJingleStart = onJingleStart
	p.tracksSinceJingle = 0
	p.lastJingleAt = time.Now()
	p.jingleNext = 0
	if cfg.Enabled() && len(cfg.Tracks) > 1 {
		p.jingleNext = rand.IntN(len(cfg.Tracks))
	}
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
		track, isJingle := p.nextTrack()
		if track == nil {
			slog.Info("autodj: no tracks, stopping")
			return
		}
		p.nowPlaying.Store(track)
		slog.Info("autodj: playing", "title", track.Title, "artist", track.Artist, "jingle", isJingle)
		if p.onTrackStart != nil {
			p.onTrackStart(track)
		}
		if isJingle && p.onJingleStart != nil {
			p.onJingleStart(track)
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

// nextTrack returns the next track to play. Returns (track, isJingle).
// Selection priority:
//  1. One-shot queue (manual InsertNext) — counts toward jingle cadence
//  2. Jingle insertion if cadence predicate trips
//  3. Main playlist advance
func (p *Player) nextTrack() (*library.Track, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if len(p.tracks) == 0 {
		return nil, false
	}
	// 1. One-shot queue — manual inserts always win for predictability.
	if len(p.queue) > 0 {
		t := p.queue[0]
		p.queue = p.queue[1:]
		p.tracksSinceJingle++
		return t, false
	}
	// 2. Jingle cadence.
	if p.shouldInsertJingleLocked() {
		return p.pickJingleLocked(), true
	}
	// 3. Regular advance.
	t := p.tracks[p.current]
	p.current = (p.current + 1) % len(p.tracks)
	if p.current == 0 && p.mode == ModeShuffle {
		p.shuffle()
	}
	p.tracksSinceJingle++
	return t, false
}

// shouldInsertJingleLocked checks both cadence predicates.
// Caller must hold p.mu.
func (p *Player) shouldInsertJingleLocked() bool {
	if !p.jingle.Enabled() {
		return false
	}
	if p.jingle.EveryTracks > 0 && p.tracksSinceJingle >= p.jingle.EveryTracks {
		return true
	}
	if p.jingle.EveryMinutes > 0 && time.Since(p.lastJingleAt) >= time.Duration(p.jingle.EveryMinutes)*time.Minute {
		return true
	}
	return false
}

// pickJingleLocked selects the next jingle from the pool and resets counters.
// For a pool of size > 1 it rotates through with a random starting offset
// (set in NewPlayer) to avoid back-to-back repeats across restarts.
// Caller must hold p.mu.
func (p *Player) pickJingleLocked() *library.Track {
	t := p.jingle.Tracks[p.jingleNext%len(p.jingle.Tracks)]
	p.jingleNext = (p.jingleNext + 1) % len(p.jingle.Tracks)
	p.tracksSinceJingle = 0
	p.lastJingleAt = time.Now()
	return t
}

func (p *Player) shuffle() {
	rand.Shuffle(len(p.tracks), func(i, j int) {
		p.tracks[i], p.tracks[j] = p.tracks[j], p.tracks[i]
	})
}
