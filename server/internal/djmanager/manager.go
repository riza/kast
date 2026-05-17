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

// savedSession is the on-disk record for a single active AutoDJ session.
type savedSession struct {
	Mount      string `json:"mount"`
	PlaylistID string `json:"playlist_id"`
	Mode       string `json:"mode"`
}

// SessionInfo is a read-only snapshot of a running AutoDJ session.
type SessionInfo struct {
	Mount      string `json:"mount"`
	PlaylistID string `json:"playlist_id"`
}

// Manager maintains one session per mount name.
type Manager struct {
	mu        sync.Mutex
	sessions  map[string]*session         // key = "/radio1" etc.
	history   map[string][]*library.Track // key = mount name, max 10 entries newest-first
	segmenter *hls.Segmenter
	mounts    *mount.Manager
	db        *sql.DB
	Trackers  *hls.TrackerRegistry
	WebRTC    *webrtcmanager.Manager
}

// NewManager returns a Manager wired to the given segmenter, mount manager, and db.
func NewManager(segmenter *hls.Segmenter, mounts *mount.Manager, db *sql.DB) *Manager {
	return &Manager{
		sessions:  make(map[string]*session),
		history:   make(map[string][]*library.Track),
		Trackers:  hls.NewTrackerRegistry(),
		segmenter: segmenter,
		mounts:    mounts,
		db:        db,
		WebRTC:    webrtcmanager.New(),
	}
}

// Start begins AutoDJ playback on mountName.
// Any existing session for that mount is stopped first.
// tracks must be non-empty (caller should validate before calling).
// startFromPath resumes playback from the track after the given path (empty = from beginning).
// onTrackChange, if non-nil, is called each time a new track starts playing.
func (m *Manager) Start(
	ctx context.Context,
	mountName string,
	playlistID string,
	startFromPath string,
	onTrackChange func(path string),
	tracks []*library.Track,
	mode autodj.Mode,
	crossfadeMs int,
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

	// Determine protocol from mount config.
	llhls := false
	if mt, err := m.mounts.Get(mountName); err == nil {
		llhls = mt.Protocol == "LL-HLS"
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
	hlsCmd, err := m.segmenter.StartMount(sessCtx, mountName, llhls, rtpPort)
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
	}

	// Start the AutoDJ player in a background goroutine.
	player := autodj.NewPlayer(tracks, mode, crossfadeMs, startFromPath, trackCb)
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

	// Background: wait for ffmpeg to exit and clean up.
	go func() {
		if err := hlsCmd.Wait(); err != nil {
			// Only log as error if context was not intentionally cancelled.
			if sessCtx.Err() == nil {
				slog.Error("djmanager: hls ffmpeg crashed",
					"mount", mountName, "err", err)
				m.mounts.SetStatus(mountName, mount.StatusError)
			}
		} else {
			m.mounts.SetStatus(mountName, mount.StatusIdle)
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

// pushHistory prepends t to the history for mountName (max 10 entries).
// Caller must NOT hold m.mu; this method acquires it.
func (m *Manager) pushHistory(mountName string, t *library.Track) {
	m.mu.Lock()
	defer m.mu.Unlock()
	prev := m.history[mountName]
	// Avoid duplicate consecutive entries.
	if len(prev) > 0 && prev[0].ID == t.ID {
		return
	}
	updated := make([]*library.Track, 0, 11)
	updated = append(updated, t)
	updated = append(updated, prev...)
	if len(updated) > 10 {
		updated = updated[:10]
	}
	m.history[mountName] = updated
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

// RecentTracks returns a snapshot of the last 10 tracks played on mountName
// (newest first). Returns nil if there is no history.
func (m *Manager) RecentTracks(mountName string) []*library.Track {
	m.mu.Lock()
	defer m.mu.Unlock()
	h := m.history[mountName]
	if len(h) == 0 {
		return nil
	}
	out := make([]*library.Track, len(h))
	copy(out, h)
	return out
}

// saveState persists a snapshot of all active sessions to the database
// so they can be restored on the next startup.
func (m *Manager) saveState() {
	if m.db == nil {
		return
	}
	m.mu.Lock()
	saved := make([]savedSession, 0, len(m.sessions))
	for mountName, sess := range m.sessions {
		saved = append(saved, savedSession{
			Mount:      mountName,
			PlaylistID: sess.playlistID,
			Mode:       sess.mode,
		})
	}
	m.mu.Unlock()

	tx, err := m.db.Begin()
	if err != nil {
		slog.Warn("djmanager: saveState begin tx", "err", err)
		return
	}
	if _, err := tx.Exec("DELETE FROM autodj_sessions"); err != nil {
		tx.Rollback()
		slog.Warn("djmanager: saveState delete", "err", err)
		return
	}
	for _, s := range saved {
		if _, err := tx.Exec(
			"INSERT INTO autodj_sessions (mount, playlist_id, mode) VALUES (?, ?, ?)",
			s.Mount, s.PlaylistID, s.Mode,
		); err != nil {
			slog.Warn("djmanager: saveState insert", "mount", s.Mount, "err", err)
		}
	}
	if err := tx.Commit(); err != nil {
		slog.Warn("djmanager: saveState commit", "err", err)
	}
}

// Restore reads active sessions from the database and restarts them.
// Call after the initial library scan so that track data is available.
func (m *Manager) Restore(ctx context.Context, playlists *playlist.Manager, scanner *library.Scanner) {
	if m.db == nil {
		return
	}
	rows, err := m.db.Query("SELECT mount, playlist_id, mode FROM autodj_sessions")
	if err != nil {
		slog.Warn("djmanager: restore query", "err", err)
		return
	}
	defer rows.Close()

	var saved []savedSession
	for rows.Next() {
		var s savedSession
		if err := rows.Scan(&s.Mount, &s.PlaylistID, &s.Mode); err != nil {
			continue
		}
		saved = append(saved, s)
	}
	if err := rows.Err(); err != nil || len(saved) == 0 {
		return
	}

	allTracks := scanner.Tracks()
	byPath := make(map[string]*library.Track, len(allTracks))
	for _, t := range allTracks {
		byPath[t.Path] = t
	}

	for _, s := range saved {
		pl, err := playlists.Get(s.PlaylistID)
		if err != nil {
			slog.Warn("djmanager: restore: playlist not found, skipping",
				"mount", s.Mount, "playlist_id", s.PlaylistID)
			continue
		}

		var tracks []*library.Track
		for _, p := range pl.TrackPaths {
			if t, ok := byPath[p]; ok {
				tracks = append(tracks, t)
			}
		}
		if len(tracks) == 0 {
			slog.Warn("djmanager: restore: no tracks in library for playlist, skipping",
				"mount", s.Mount, "playlist", pl.Name)
			continue
		}

		mode := autodj.ModeSequential
		if s.Mode == "shuffle" {
			mode = autodj.ModeShuffle
		}
		playlistID := s.PlaylistID
		onTrackChange := func(path string) {
			if err := playlists.SetLastPlayed(playlistID, path); err != nil {
				slog.Warn("djmanager: restore: failed to save last played", "err", err)
			}
		}

		if err := m.Start(ctx, s.Mount, s.PlaylistID, pl.LastPlayedPath, onTrackChange, tracks, mode, pl.CrossfadeMs); err != nil {
			slog.Error("djmanager: restore: failed to start", "mount", s.Mount, "err", err)
		} else {
			slog.Info("djmanager: restored session", "mount", s.Mount, "playlist", pl.Name, "mode", s.Mode)
		}
	}
}
