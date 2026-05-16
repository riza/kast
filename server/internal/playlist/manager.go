// Package playlist manages named track playlists.
package playlist

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Playlist is a named, ordered set of audio file paths.
type Playlist struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	Description    string    `json:"description"`
	Mode           string    `json:"mode"`            // "sequential" | "shuffle"
	CrossfadeMs    int       `json:"crossfade_ms"`    // 0 = disabled
	TrackPaths     []string  `json:"track_paths"`
	LastPlayedPath string    `json:"last_played_path"` // path of the last track that started playing
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// ErrNotFound is returned when a playlist does not exist.
var ErrNotFound = errors.New("playlist not found")

// Manager holds all playlists and serialises them to disk.
type Manager struct {
	mu        sync.RWMutex
	playlists map[string]*Playlist // keyed by Playlist.ID
	storeFile string
}

// NewManager creates a Manager backed by dataDir/playlists.json.
func NewManager(dataDir string) (*Manager, error) {
	if err := os.MkdirAll(dataDir, 0o750); err != nil {
		return nil, fmt.Errorf("playlist: mkdir %q: %w", dataDir, err)
	}
	m := &Manager{
		playlists: make(map[string]*Playlist),
		storeFile: filepath.Join(dataDir, "playlists.json"),
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
	mode := coerceMode(req.Mode)
	paths := req.TrackPaths
	if paths == nil {
		paths = []string{}
	}

	now := time.Now().UTC()
	p := &Playlist{
		ID:          newID(),
		Name:        req.Name,
		Description: req.Description,
		Mode:        mode,
		CrossfadeMs: req.CrossfadeMs,
		TrackPaths:  paths,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.playlists[p.ID] = p
	if err := m.persist(); err != nil {
		return nil, err
	}
	cp := *p
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
	if err := m.persist(); err != nil {
		return nil, err
	}
	cp := *p
	return &cp, nil
}

// SetLastPlayed persists the path of the track that just started playing.
// Called by the DJManager on every track change to enable resume-on-restart.
func (m *Manager) SetLastPlayed(id, path string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.playlists[id]
	if !ok {
		return ErrNotFound
	}
	p.LastPlayedPath = path
	return m.persist()
}

// Delete removes a playlist by ID.
func (m *Manager) Delete(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.playlists[id]; !ok {
		return ErrNotFound
	}
	delete(m.playlists, id)
	return m.persist()
}

// coerceMode normalises the mode string; defaults to "sequential".
func coerceMode(s string) string {
	if s == "shuffle" {
		return "shuffle"
	}
	return "sequential"
}

func (m *Manager) persist() error {
	list := make([]*Playlist, 0, len(m.playlists))
	for _, p := range m.playlists {
		list = append(list, p)
	}
	b, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	tmp := m.storeFile + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return fmt.Errorf("playlist: write tmp: %w", err)
	}
	return os.Rename(tmp, m.storeFile)
}

func (m *Manager) load() error {
	b, err := os.ReadFile(filepath.Clean(m.storeFile))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("playlist: read %q: %w", m.storeFile, err)
	}
	var list []*Playlist
	if err := json.Unmarshal(b, &list); err != nil {
		return fmt.Errorf("playlist: parse %q: %w", m.storeFile, err)
	}
	for _, p := range list {
		m.playlists[p.ID] = p
	}
	return nil
}

func newID() string {
	return fmt.Sprintf("%x", time.Now().UnixNano())
}
