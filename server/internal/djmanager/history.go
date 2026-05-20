package djmanager

import "github.com/riza/kast/internal/library"

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
