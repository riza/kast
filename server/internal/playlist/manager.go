// Package playlist manages named track playlists.
package playlist

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Playlist is a named, ordered set of audio file paths.
type Playlist struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	Description    string    `json:"description"`
	Mode           string    `json:"mode"`
	CrossfadeMs    int       `json:"crossfade_ms"`
	TrackPaths     []string  `json:"track_paths"`
	LastPlayedPath string    `json:"last_played_path"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// ErrNotFound is returned when a playlist does not exist.
var ErrNotFound = errors.New("playlist not found")

// Manager holds all playlists in memory and persists them to SQLite.
type Manager struct {
	mu        sync.RWMutex
	playlists map[string]*Playlist
	db        *sql.DB
}

// NewManager creates a Manager backed by db.
func NewManager(db *sql.DB) (*Manager, error) {
	m := &Manager{
		playlists: make(map[string]*Playlist),
		db:        db,
	}
	if err := m.load(); err != nil {
		return nil, err
	}
	return m, nil
}

// List returns a snapshot of all playlists.
func (m *Manager) List() []*Playlist {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]*Playlist, 0, len(m.playlists))
	for _, p := range m.playlists {
		cp := *p
		cp.TrackPaths = append([]string(nil), p.TrackPaths...)
		out = append(out, &cp)
	}
	return out
}

// Get returns a single playlist by ID.
func (m *Manager) Get(id string) (*Playlist, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	p, ok := m.playlists[id]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *p
	cp.TrackPaths = append([]string(nil), p.TrackPaths...)
	return &cp, nil
}

// CreateRequest is the input DTO for creating a playlist.
type CreateRequest struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Mode        string   `json:"mode"`
	CrossfadeMs int      `json:"crossfade_ms"`
	TrackPaths  []string `json:"track_paths"`
}

// Create adds a new playlist.
func (m *Manager) Create(req CreateRequest) (*Playlist, error) {
	if req.Name == "" {
		return nil, errors.New("playlist name is required")
	}
	paths := req.TrackPaths
	if paths == nil {
		paths = []string{}
	}
	now := time.Now().UTC()
	p := &Playlist{
		ID:          newID(),
		Name:        req.Name,
		Description: req.Description,
		Mode:        coerceMode(req.Mode),
		CrossfadeMs: req.CrossfadeMs,
		TrackPaths:  paths,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.playlists[p.ID] = p
	if err := m.insertDB(p); err != nil {
		slog.Error("playlist: db insert", "err", err)
	}
	cp := *p
	cp.TrackPaths = append([]string(nil), p.TrackPaths...)
	return &cp, nil
}

// UpdateRequest is the input DTO for updating a playlist.
type UpdateRequest struct {
	Name        *string  `json:"name"`
	Description *string  `json:"description"`
	Mode        *string  `json:"mode"`
	CrossfadeMs *int     `json:"crossfade_ms"`
	TrackPaths  []string `json:"track_paths"`
}

// Update modifies an existing playlist.
func (m *Manager) Update(id string, req UpdateRequest) (*Playlist, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.playlists[id]
	if !ok {
		return nil, ErrNotFound
	}
	if req.Name != nil {
		if *req.Name == "" {
			return nil, errors.New("playlist name cannot be empty")
		}
		p.Name = *req.Name
	}
	if req.Description != nil {
		p.Description = *req.Description
	}
	if req.Mode != nil {
		p.Mode = coerceMode(*req.Mode)
	}
	if req.CrossfadeMs != nil {
		p.CrossfadeMs = *req.CrossfadeMs
	}
	if req.TrackPaths != nil {
		p.TrackPaths = req.TrackPaths
	}
	p.UpdatedAt = time.Now().UTC()

	if err := m.updateDB(p); err != nil {
		slog.Error("playlist: db update", "err", err)
	}
	cp := *p
	cp.TrackPaths = append([]string(nil), p.TrackPaths...)
	return &cp, nil
}

// SetLastPlayed persists the path of the track that just started playing.
func (m *Manager) SetLastPlayed(id, path string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.playlists[id]
	if !ok {
		return ErrNotFound
	}
	p.LastPlayedPath = path
	_, err := m.db.Exec("UPDATE playlists SET last_played_path = ? WHERE id = ?", path, id)
	if err != nil {
		return fmt.Errorf("playlist: set last played: %w", err)
	}
	return nil
}

// Delete removes a playlist by ID.
func (m *Manager) Delete(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.playlists[id]; !ok {
		return ErrNotFound
	}
	delete(m.playlists, id)
	if _, err := m.db.Exec("DELETE FROM playlists WHERE id = ?", id); err != nil {
		slog.Error("playlist: db delete", "err", err)
	}
	return nil
}

// ── internal ──────────────────────────────────────────────────────────────────

func (m *Manager) insertDB(p *Playlist) error {
	paths, _ := json.Marshal(p.TrackPaths)
	_, err := m.db.Exec(`
		INSERT INTO playlists (id, name, description, mode, crossfade_ms, track_paths, last_played_path, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		p.ID, p.Name, p.Description, p.Mode, p.CrossfadeMs,
		string(paths), p.LastPlayedPath,
		p.CreatedAt.UTC().Format(time.RFC3339),
		p.UpdatedAt.UTC().Format(time.RFC3339),
	)
	if err != nil {
		return fmt.Errorf("playlist: insert: %w", err)
	}
	return nil
}

func (m *Manager) updateDB(p *Playlist) error {
	paths, _ := json.Marshal(p.TrackPaths)
	_, err := m.db.Exec(`
		UPDATE playlists SET name = ?, description = ?, mode = ?, crossfade_ms = ?,
		                     track_paths = ?, last_played_path = ?, updated_at = ?
		WHERE id = ?`,
		p.Name, p.Description, p.Mode, p.CrossfadeMs,
		string(paths), p.LastPlayedPath,
		p.UpdatedAt.UTC().Format(time.RFC3339),
		p.ID,
	)
	if err != nil {
		return fmt.Errorf("playlist: update: %w", err)
	}
	return nil
}

func (m *Manager) load() error {
	rows, err := m.db.Query(`
		SELECT id, name, description, mode, crossfade_ms, track_paths, last_played_path, created_at, updated_at
		FROM playlists`)
	if err != nil {
		return fmt.Errorf("playlist: load: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var (
			p          Playlist
			pathsJSON  string
			createdAt  string
			updatedAt  string
		)
		if err := rows.Scan(
			&p.ID, &p.Name, &p.Description, &p.Mode, &p.CrossfadeMs,
			&pathsJSON, &p.LastPlayedPath, &createdAt, &updatedAt,
		); err != nil {
			return fmt.Errorf("playlist: load scan: %w", err)
		}
		if err := json.Unmarshal([]byte(pathsJSON), &p.TrackPaths); err != nil {
			slog.Warn("playlist: load: corrupt track paths JSON", "id", p.ID, "err", err)
		}
		if p.TrackPaths == nil {
			p.TrackPaths = []string{}
		}
		p.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
		p.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt)
		cp := p
		m.playlists[p.ID] = &cp
	}
	return rows.Err()
}

func coerceMode(s string) string {
	if s == "shuffle" {
		return "shuffle"
	}
	return "sequential"
}

func newID() string {
	return uuid.New().String()
}
