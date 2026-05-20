package djmanager

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/riza/kast/internal/autodj"
	"github.com/riza/kast/internal/library"
)

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
func (m *Manager) Restore(ctx context.Context) {
	if m.db == nil || m.playlists == nil || m.scanner == nil {
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

	allTracks := m.scanner.Tracks()
	byPath := make(map[string]*library.Track, len(allTracks))
	for _, t := range allTracks {
		byPath[t.Path] = t
	}

	for _, s := range saved {
		pl, err := m.playlists.Get(s.PlaylistID)
		if err != nil {
			slog.Warn("djmanager: restore: playlist not found",
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
			slog.Warn("djmanager: restore: no tracks for playlist",
				"mount", s.Mount, "playlist", pl.Name)
			continue
		}

		mode := autodj.ModeSequential
		if strings.EqualFold(s.Mode, "shuffle") {
			mode = autodj.ModeShuffle
		}

		playlistID := s.PlaylistID
		onTrackChange := func(path string) {
			if err := m.playlists.SetLastPlayed(playlistID, path); err != nil {
				slog.Warn("djmanager: restore: failed to save last played", "err", err)
			}
		}

		jingle := m.ResolveJingles(s.Mount, byPath)
		if err := m.Start(ctx, s.Mount, s.PlaylistID, pl.LastPlayedPath, onTrackChange, tracks, mode, pl.CrossfadeMs, jingle); err != nil {
			slog.Error("djmanager: restore: failed to start", "mount", s.Mount, "err", err)
		} else {
			slog.Info("djmanager: restored session", "mount", s.Mount, "playlist", pl.Name, "mode", s.Mode)
		}
	}
}

// RestartMount stops and immediately restarts the AutoDJ session for mountName
// using the same playlist and mode. Returns true if a restart occurred, false
// if no session was running. Call after audio config changes on a mount.
func (m *Manager) RestartMount(mountName string) (bool, error) {
	if m.playlists == nil || m.scanner == nil {
		return false, nil
	}
	m.mu.Lock()
	sess, ok := m.sessions[mountName]
	if !ok {
		m.mu.Unlock()
		return false, nil
	}
	playlistID := sess.playlistID
	modeStr := sess.mode
	m.mu.Unlock()

	pl, err := m.playlists.Get(playlistID)
	if err != nil {
		return false, fmt.Errorf("djmanager: restart %s: playlist %s: %w", mountName, playlistID, err)
	}

	allTracks := m.scanner.Tracks()
	byPath := make(map[string]*library.Track, len(allTracks))
	for _, t := range allTracks {
		byPath[t.Path] = t
	}
	var tracks []*library.Track
	for _, p := range pl.TrackPaths {
		if t, ok := byPath[p]; ok {
			tracks = append(tracks, t)
		}
	}
	if len(tracks) == 0 {
		return false, fmt.Errorf("djmanager: restart %s: no tracks available", mountName)
	}

	mode := autodj.ModeSequential
	if strings.EqualFold(modeStr, "shuffle") {
		mode = autodj.ModeShuffle
	}
	onTrackChange := func(path string) {
		if err := m.playlists.SetLastPlayed(playlistID, path); err != nil {
			slog.Warn("djmanager: restart: failed to save last played", "err", err)
		}
	}

	jingle := m.ResolveJingles(mountName, byPath)
	if err := m.Start(context.Background(), mountName, playlistID, "", onTrackChange, tracks, mode, pl.CrossfadeMs, jingle); err != nil {
		return false, err
	}
	slog.Info("djmanager: restarted (audio config change)", "mount", mountName)
	return true, nil
}
