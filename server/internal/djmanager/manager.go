// Package djmanager manages AutoDJ playback sessions per mount.
// Each active session consists of an autodj.Player writing PCM audio through
// an io.Pipe into an ffmpeg HLS segmenter process.
package djmanager

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"log/slog"
	"os/exec"
	"sync"

	"github.com/riza/kast/internal/autodj"
	"github.com/riza/kast/internal/hls"
	"github.com/riza/kast/internal/library"
	"github.com/riza/kast/internal/mount"
	"github.com/riza/kast/internal/playlist"
	"github.com/riza/kast/internal/webrtcmanager"
	"github.com/riza/kast/internal/webhook"
)

// session holds all resources for one active AutoDJ mount.
type session struct {
	player     *autodj.Player
	cmd        *exec.Cmd
	pipeW      *io.PipeWriter
	cancel     context.CancelFunc
	ctx        context.Context // for checking intentional cancel
	playlistID string
	mode       string
}

// Manager maintains one session per mount name.
type Manager struct {
	mu        sync.Mutex
	sessions  map[string]*session         // key = "/radio1" etc.
	history   map[string][]*library.Track // key = mount name, max 10 entries newest-first
	segmenter *hls.Segmenter
	mounts    *mount.Manager
	db        *sql.DB
	playlists *playlist.Manager
	scanner   *library.Scanner
	webhooks  *webhook.Manager
	Trackers  *hls.TrackerRegistry
	WebRTC    *webrtcmanager.Manager
}

// NewManager returns a Manager wired to the given segmenter, mount manager, db, playlists, and scanner.
func NewManager(segmenter *hls.Segmenter, mounts *mount.Manager, db *sql.DB, playlists *playlist.Manager, scanner *library.Scanner, webrtcCfg webrtcmanager.Config, webhooks *webhook.Manager) *Manager {
	return &Manager{
		sessions:  make(map[string]*session),
		history:   make(map[string][]*library.Track),
		Trackers:  hls.NewTrackerRegistry(),
		segmenter: segmenter,
		mounts:    mounts,
		db:        db,
		playlists: playlists,
		scanner:   scanner,
		webhooks:  webhooks,
		WebRTC:    webrtcmanager.New(webrtcCfg),
	}
}

// Start begins AutoDJ playback on mountName.
// Any existing session for that mount is stopped first.
// tracks must be non-empty (caller should validate before calling).
// startFromPath resumes playback from the track after the given path (empty = from beginning).
// onTrackChange, if non-nil, is called each time a new track starts playing.
// jingle (zero-value or empty Tracks) disables jingle insertion.
func (m *Manager) Start(
	ctx context.Context,
	mountName string,
	playlistID string,
	startFromPath string,
	onTrackChange func(path string),
	tracks []*library.Track,
	mode autodj.Mode,
	crossfadeMs int,
	jingle autodj.JingleConfig,
) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Stop any existing session for this mount.
	if old, ok := m.sessions[mountName]; ok {
		old.player.Stop()
		old.cancel()
		old.pipeW.Close() // safe to call after player.Stop(); second close is a no-op
		delete(m.sessions, mountName)
	}

	sessCtx, cancel := context.WithCancel(ctx)

	// Pipe: AutoDJ → ffmpeg stdin (HLS segmenter).
	pipeR, pipeW := io.Pipe()

	// Determine config from mount.
	llhls := false
	codec := "AAC"
	bitrate := "128k"
	if mt, err := m.mounts.Get(mountName); err == nil {
		llhls = mt.Protocol == "LL-HLS"
		if mt.Codec != "" {
			codec = mt.Codec
		}
		if mt.Bitrate != "" {
			bitrate = mt.Bitrate
		}
	}

	// Allocate a UDP port for WebRTC RTP input. Failures are non-fatal: HLS
	// still works without WebRTC.
	rtpPort, err := m.WebRTC.AllocatePort(mountName)
	if err != nil {
		slog.Warn("djmanager: webrtc rtp allocation failed, continuing without webrtc",
			"mount", mountName, "err", err)
		rtpPort = 0
	}

	// Start the HLS ffmpeg process (with optional RTP output for WebRTC).
	hlsCmd, err := m.segmenter.StartMount(sessCtx, mountName, llhls, rtpPort, codec, bitrate)
	if err != nil {
		cancel()
		pipeR.Close()
		pipeW.Close()
		return fmt.Errorf("djmanager: start segmenter for %s: %w", mountName, err)
	}
	hlsCmd.Stdin = pipeR
	if err := hlsCmd.Start(); err != nil {
		cancel()
		pipeR.Close()
		pipeW.Close()
		return fmt.Errorf("djmanager: start ffmpeg for %s: %w", mountName, err)
	}

	// For LL-HLS mounts, start watching the output directory for new parts.
	if llhls {
		dir := m.segmenter.MountDir(mountName)
		if _, err := m.Trackers.Start(dir); err != nil {
			slog.Warn("djmanager: could not start ll-hls tracker", "mount", mountName, "err", err)
		}
	}

	// Wrap onTrackChange so it records history and calls the external callback.
	trackCb := func(t *library.Track) {
		m.pushHistory(mountName, t)
		if onTrackChange != nil {
			onTrackChange(t.Path)
		}
		if m.webhooks != nil {
			m.webhooks.Emit("autodj.track.changed", map[string]any{
				"mount":       mountName,
				"id":          t.ID,
				"title":       t.Title,
				"artist":      t.Artist,
				"album":       t.Album,
				"duration_ms": t.DurationMs,
			})
		}
	}

	// Start the AutoDJ player in a background goroutine.
	player := autodj.NewPlayer(tracks, mode, crossfadeMs, startFromPath, trackCb)
	if jingle.Enabled() {
		jingleCb := func(t *library.Track) {
			if m.webhooks != nil {
				m.webhooks.Emit("autodj.jingle.played", map[string]any{
					"mount":       mountName,
					"id":          t.ID,
					"title":       t.Title,
					"artist":      t.Artist,
					"duration_ms": t.DurationMs,
				})
			}
		}
		player.SetJingles(jingle, jingleCb)
	}
	player.Start(sessCtx, pipeW) // goroutine; closes pipeW when done

	sess := &session{
		player:     player,
		cmd:        hlsCmd,
		pipeW:      pipeW,
		cancel:     cancel,
		ctx:        sessCtx,
		playlistID: playlistID,
		mode:       string(mode),
	}
	m.sessions[mountName] = sess
	m.mounts.SetStatus(mountName, mount.StatusLive)
	if m.webhooks != nil {
		m.webhooks.Emit("mount.status.changed", map[string]any{"mount": mountName, "status": "live"})
	}

	// Background: wait for ffmpeg to exit and clean up.
	go func() {
		if err := hlsCmd.Wait(); err != nil {
			// Only log as error if context was not intentionally cancelled.
			if sessCtx.Err() == nil {
				slog.Error("djmanager: hls ffmpeg crashed",
					"mount", mountName, "err", err)
				m.mounts.SetStatus(mountName, mount.StatusError)
				if m.webhooks != nil {
					m.webhooks.Emit("mount.status.changed", map[string]any{"mount": mountName, "status": "error"})
				}
			}
		} else {
			m.mounts.SetStatus(mountName, mount.StatusIdle)
			if m.webhooks != nil {
				m.webhooks.Emit("mount.status.changed", map[string]any{"mount": mountName, "status": "idle"})
			}
		}
		m.mu.Lock()
		// Only remove if this is still our session (a new Start may have replaced it).
		if cur, ok := m.sessions[mountName]; ok && cur == sess {
			delete(m.sessions, mountName)
		}
		m.mu.Unlock()
	}()

	go m.saveState()
	slog.Info("djmanager: started", "mount", mountName, "tracks", len(tracks), "mode", mode)
	return nil
}

// Stop halts the AutoDJ session for mountName.
func (m *Manager) Stop(mountName string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	sess, ok := m.sessions[mountName]
	if !ok {
		return fmt.Errorf("djmanager: no active session for %s", mountName)
	}
	sess.player.Stop()
	sess.cancel()
	sess.pipeW.Close()
	delete(m.sessions, mountName)
	m.Trackers.Stop(m.segmenter.MountDir(mountName))
	m.WebRTC.StopMount(mountName)
	m.mounts.SetStatus(mountName, mount.StatusIdle)
	if m.webhooks != nil {
		m.webhooks.Emit("mount.status.changed", map[string]any{"mount": mountName, "status": "idle"})
	}
	go m.saveState()
	slog.Info("djmanager: stopped", "mount", mountName)
	return nil
}

// NowPlaying returns the track currently playing on mountName, or nil if idle.
func (m *Manager) NowPlaying(mountName string) *library.Track {
	m.mu.Lock()
	defer m.mu.Unlock()
	sess, ok := m.sessions[mountName]
	if !ok {
		return nil
	}
	return sess.player.NowPlaying()
}

// Skip advances the current track immediately on mountName.
func (m *Manager) Skip(mountName string) error {
	m.mu.Lock()
	sess, ok := m.sessions[mountName]
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("djmanager: no active session for %s", mountName)
	}
	sess.player.Skip()
	return nil
}

// IsRunning reports whether mountName has an active AutoDJ session.
func (m *Manager) IsRunning(mountName string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.sessions[mountName]
	return ok
}

// GetSession returns the session info for mountName, or nil if not running.
func (m *Manager) GetSession(mountName string) *SessionInfo {
	m.mu.Lock()
	defer m.mu.Unlock()
	sess, ok := m.sessions[mountName]
	if !ok {
		return nil
	}
	return &SessionInfo{Mount: mountName, PlaylistID: sess.playlistID}
}

// ListSessions returns info for all active AutoDJ sessions.
func (m *Manager) ListSessions() []*SessionInfo {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]*SessionInfo, 0, len(m.sessions))
	for mountName, sess := range m.sessions {
		out = append(out, &SessionInfo{Mount: mountName, PlaylistID: sess.playlistID})
	}
	return out
}

// StopAll halts every active session. Call during graceful shutdown.
func (m *Manager) StopAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for name, sess := range m.sessions {
		sess.player.Stop()
		sess.cancel()
		sess.pipeW.Close()
		delete(m.sessions, name)
		m.Trackers.Stop(m.segmenter.MountDir(name))
		slog.Info("djmanager: stopped on shutdown", "mount", name)
	}
	m.WebRTC.StopAll()
	go m.saveState()
}

// InsertNext queues t to play immediately after the current track on mountName.
func (m *Manager) InsertNext(mountName string, t *library.Track) error {
	m.mu.Lock()
	sess, ok := m.sessions[mountName]
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("djmanager: no active session for %s", mountName)
	}
	sess.player.InsertNext(t)
	return nil
}

// JumpTo sets playback on mountName to tracks[index] immediately.
func (m *Manager) JumpTo(mountName string, index int) error {
	m.mu.Lock()
	sess, ok := m.sessions[mountName]
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("djmanager: no active session for %s", mountName)
	}
	sess.player.JumpTo(index)
	return nil
}

// Tracks returns the active session's player track list, now-playing ID, and queue.
// Returns nil tracks if no session is running.
func (m *Manager) Tracks(mountName string) (tracks []*library.Track, nowPlayingID string, queue []*library.Track) {
	m.mu.Lock()
	sess, ok := m.sessions[mountName]
	m.mu.Unlock()
	if !ok {
		return nil, "", nil
	}
	return sess.player.Tracks()
}

// ResolveJingles returns the jingle insertion config for a mount, looking up
// its configured jingle playlist and matching track paths against byPath.
// Returns a disabled config (Enabled() == false) when:
//   - the mount has no jingle_playlist_id set
//   - both interval values are zero
//   - the jingle playlist is missing or empty in the library
func (m *Manager) ResolveJingles(mountName string, byPath map[string]*library.Track) autodj.JingleConfig {
	if m.mounts == nil || m.playlists == nil {
		return autodj.JingleConfig{}
	}
	mt, err := m.mounts.Get(mountName)
	if err != nil || mt.JinglePlaylistID == "" {
		return autodj.JingleConfig{}
	}
	if mt.JingleEveryTracks <= 0 && mt.JingleEveryMinutes <= 0 {
		return autodj.JingleConfig{}
	}
	jp, err := m.playlists.Get(mt.JinglePlaylistID)
	if err != nil {
		slog.Warn("djmanager: jingle playlist not found",
			"mount", mountName, "playlist_id", mt.JinglePlaylistID)
		return autodj.JingleConfig{}
	}
	jingles := make([]*library.Track, 0, len(jp.TrackPaths))
	for _, p := range jp.TrackPaths {
		if t, ok := byPath[p]; ok {
			jingles = append(jingles, t)
		}
	}
	if len(jingles) == 0 {
		slog.Warn("djmanager: jingle playlist has no library tracks",
			"mount", mountName, "playlist", jp.Name)
		return autodj.JingleConfig{}
	}
	return autodj.JingleConfig{
		Tracks:       jingles,
		EveryTracks:  mt.JingleEveryTracks,
		EveryMinutes: mt.JingleEveryMinutes,
	}
}

