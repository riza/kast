// Package schedule manages time-block schedules that drive AutoDJ sessions
// on mounts during configured weekday windows.
//
// A Schedule is a (mount, playlist, weekday-set, [start, end)) tuple. The
// runner.go control loop reconciles djmanager state against the schedule set
// every few seconds. Manager is the CRUD + persistence layer only; it does
// not start or stop any playback itself.
package schedule

import (
	"database/sql"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/riza/kast/internal/mount"
	"github.com/riza/kast/internal/playlist"
)

// ErrNotFound is returned when a schedule ID does not exist.
var ErrNotFound = errors.New("schedule not found")

// Schedule is one weekly recurring time block.
//
// DaysMask uses Go's time.Weekday encoding: bit 0 = Sunday … bit 6 = Saturday.
// StartMinutes and EndMinutes are minutes since midnight in the server's
// configured timezone. EndMinutes must be strictly greater than StartMinutes;
// midnight crossing is not supported in v1 (users compose two entries).
type Schedule struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Mount        string    `json:"mount"`
	PlaylistID   string    `json:"playlist_id"`
	DaysMask     uint8     `json:"days_mask"`
	StartMinutes int       `json:"start_minutes"`
	EndMinutes   int       `json:"end_minutes"`
	Enabled      bool      `json:"enabled"`
	CreatedAt    time.Time `json:"created_at"`
}

// CreateRequest is the payload for POST /api/schedules.
type CreateRequest struct {
	Name         string `json:"name"`
	Mount        string `json:"mount"`
	PlaylistID   string `json:"playlist_id"`
	DaysMask     uint8  `json:"days_mask"`
	StartMinutes int    `json:"start_minutes"`
	EndMinutes   int    `json:"end_minutes"`
	Enabled      *bool  `json:"enabled"` // nil → true
}

// UpdateRequest is the payload for PATCH /api/schedules/:id. Only non-nil
// fields are applied.
type UpdateRequest struct {
	Name         *string `json:"name"`
	Mount        *string `json:"mount"`
	PlaylistID   *string `json:"playlist_id"`
	DaysMask     *uint8  `json:"days_mask"`
	StartMinutes *int    `json:"start_minutes"`
	EndMinutes   *int    `json:"end_minutes"`
	Enabled      *bool   `json:"enabled"`
}

// Manager stores schedules in memory (loaded from SQLite at startup) and
// validates against the mount and playlist managers.
type Manager struct {
	mu        sync.RWMutex
	schedules map[string]*Schedule
	db        *sql.DB
	mounts    *mount.Manager
	playlists *playlist.Manager
}

// NewManager loads existing schedules and returns a ready Manager.
func NewManager(db *sql.DB, mounts *mount.Manager, playlists *playlist.Manager) (*Manager, error) {
	m := &Manager{
		schedules: make(map[string]*Schedule),
		db:        db,
		mounts:    mounts,
		playlists: playlists,
	}
	if err := m.load(); err != nil {
		return nil, err
	}
	return m, nil
}

func (m *Manager) load() error {
	rows, err := m.db.Query(
		`SELECT id, name, mount, playlist_id, days_mask, start_minutes, end_minutes, enabled, created_at FROM schedules`,
	)
	if err != nil {
		return fmt.Errorf("schedule: load query: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var s Schedule
		var enabledInt int
		var createdAt string
		var daysMask int
		if err := rows.Scan(&s.ID, &s.Name, &s.Mount, &s.PlaylistID, &daysMask, &s.StartMinutes, &s.EndMinutes, &enabledInt, &createdAt); err != nil {
			return fmt.Errorf("schedule: load scan: %w", err)
		}
		s.DaysMask = uint8(daysMask & 0x7F)
		s.Enabled = enabledInt != 0
		s.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
		m.schedules[s.ID] = &s
	}
	return rows.Err()
}

// List returns a snapshot of all schedules.
func (m *Manager) List() []*Schedule {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]*Schedule, 0, len(m.schedules))
	for _, s := range m.schedules {
		cp := *s
		out = append(out, &cp)
	}
	return out
}

// Get returns the schedule with the given ID.
func (m *Manager) Get(id string) (*Schedule, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.schedules[id]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *s
	return &cp, nil
}

// Create validates and persists a new schedule.
func (m *Manager) Create(req CreateRequest) (*Schedule, error) {
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	s := &Schedule{
		ID:           uuid.NewString(),
		Name:         req.Name,
		Mount:        req.Mount,
		PlaylistID:   req.PlaylistID,
		DaysMask:     req.DaysMask,
		StartMinutes: req.StartMinutes,
		EndMinutes:   req.EndMinutes,
		Enabled:      enabled,
		CreatedAt:    time.Now().UTC(),
	}
	if err := m.validate(s); err != nil {
		return nil, err
	}
	if _, err := m.db.Exec(
		`INSERT INTO schedules (id, name, mount, playlist_id, days_mask, start_minutes, end_minutes, enabled, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		s.ID, s.Name, s.Mount, s.PlaylistID, int(s.DaysMask), s.StartMinutes, s.EndMinutes, boolToInt(s.Enabled), s.CreatedAt.Format(time.RFC3339),
	); err != nil {
		return nil, err
	}
	m.mu.Lock()
	m.schedules[s.ID] = s
	m.mu.Unlock()
	cp := *s
	return &cp, nil
}

// Update modifies an existing schedule. Only non-nil fields in req are changed.
// Validation is re-run against the merged result, including overlap detection.
func (m *Manager) Update(id string, req UpdateRequest) (*Schedule, error) {
	m.mu.Lock()
	existing, ok := m.schedules[id]
	if !ok {
		m.mu.Unlock()
		return nil, ErrNotFound
	}
	merged := *existing
	if req.Name != nil {
		merged.Name = *req.Name
	}
	if req.Mount != nil {
		merged.Mount = *req.Mount
	}
	if req.PlaylistID != nil {
		merged.PlaylistID = *req.PlaylistID
	}
	if req.DaysMask != nil {
		merged.DaysMask = *req.DaysMask
	}
	if req.StartMinutes != nil {
		merged.StartMinutes = *req.StartMinutes
	}
	if req.EndMinutes != nil {
		merged.EndMinutes = *req.EndMinutes
	}
	if req.Enabled != nil {
		merged.Enabled = *req.Enabled
	}
	m.mu.Unlock()
	if err := m.validate(&merged); err != nil {
		return nil, err
	}
	if _, err := m.db.Exec(
		`UPDATE schedules SET name=?, mount=?, playlist_id=?, days_mask=?, start_minutes=?, end_minutes=?, enabled=? WHERE id=?`,
		merged.Name, merged.Mount, merged.PlaylistID, int(merged.DaysMask), merged.StartMinutes, merged.EndMinutes, boolToInt(merged.Enabled), merged.ID,
	); err != nil {
		return nil, err
	}
	m.mu.Lock()
	m.schedules[merged.ID] = &merged
	m.mu.Unlock()
	cp := merged
	return &cp, nil
}

// Delete removes a schedule by ID.
func (m *Manager) Delete(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.schedules[id]; !ok {
		return ErrNotFound
	}
	if _, err := m.db.Exec(`DELETE FROM schedules WHERE id=?`, id); err != nil {
		return fmt.Errorf("schedule: delete: %w", err)
	}
	delete(m.schedules, id)
	return nil
}

// validate runs all per-schedule rules plus an overlap check against the
// current schedule set (excluding the one being validated).
func (m *Manager) validate(s *Schedule) error {
	if s.Name == "" {
		return errors.New("name is required")
	}
	if s.Mount == "" {
		return errors.New("mount is required")
	}
	if s.PlaylistID == "" {
		return errors.New("playlist_id is required")
	}
	if m.mounts != nil {
		if _, err := m.mounts.Get(s.Mount); err != nil {
			return fmt.Errorf("mount %q does not exist", s.Mount)
		}
	}
	if m.playlists != nil {
		if _, err := m.playlists.Get(s.PlaylistID); err != nil {
			return fmt.Errorf("playlist %q does not exist", s.PlaylistID)
		}
	}
	if s.DaysMask == 0 || s.DaysMask > 0x7F {
		return errors.New("days_mask must select at least one day (bit 0=Sunday … bit 6=Saturday)")
	}
	if s.StartMinutes < 0 || s.StartMinutes >= 1440 {
		return errors.New("start_minutes must be in [0, 1440)")
	}
	if s.EndMinutes <= 0 || s.EndMinutes > 1440 {
		return errors.New("end_minutes must be in (0, 1440]")
	}
	if s.EndMinutes <= s.StartMinutes {
		return errors.New("end_minutes must be greater than start_minutes (midnight crossing is not supported; create two entries)")
	}
	return m.checkOverlap(s)
}

// checkOverlap rejects any schedule whose time window intersects another
// enabled schedule on the same mount on any shared weekday.
//
// Only enabled schedules conflict; a disabled schedule reserves no time.
// Two intervals [a, b) and [c, d) overlap iff a < d && c < b.
func (m *Manager) checkOverlap(s *Schedule) error {
	if !s.Enabled {
		return nil
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, other := range m.schedules {
		if other.ID == s.ID || !other.Enabled || other.Mount != s.Mount {
			continue
		}
		if s.DaysMask&other.DaysMask == 0 {
			continue
		}
		if s.StartMinutes < other.EndMinutes && other.StartMinutes < s.EndMinutes {
			return fmt.Errorf("overlaps with schedule %q on mount %s", other.Name, other.Mount)
		}
	}
	return nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
