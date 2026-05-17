// Package mount manages stream mount points.
package mount

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Status represents the live state of a mount.
type Status string

const (
	StatusIdle  Status = "idle"
	StatusLive  Status = "live"
	StatusError Status = "error"
)

// Mount describes a single stream endpoint.
type Mount struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`           // e.g. "/radio1"
	Description    string    `json:"description"`
	Genre          string    `json:"genre"`
	Website        string    `json:"website"`
	SourcePassword string    `json:"-"`              // never serialised to API responses
	Protocol       string    `json:"protocol"`       // "HLS" | "LL-HLS"
	Codec          string    `json:"codec"`          // "AAC" | "MP3" | "Opus"
	Bitrate        string    `json:"bitrate"`        // e.g. "128k"
	Status         Status    `json:"status"`
	Listeners      int       `json:"listeners"`
	CreatedAt      time.Time `json:"created_at"`

	// Player customisation — controlled by admin, read by public player.
	PlayerStationName string `json:"player_station_name"`
	PlayerAccent      string `json:"player_accent"`
	PlayerAccentSoft  string `json:"player_accent_soft"`
	PlayerTheme       string `json:"player_theme"`   // "dark" | "light"
	PlayerLayout      string `json:"player_layout"`  // "split" | "centered"
	PlayerAmbient     bool   `json:"player_ambient"`
	PlayerShowAbout   bool   `json:"player_show_about"`
	PlayerShowHistory bool   `json:"player_show_history"`
	PlayerShowPlaylist bool  `json:"player_show_playlist"`
}

// PlayerConfigUpdate is the DTO for updating a mount's player config.
type PlayerConfigUpdate struct {
	StationName  string `json:"player_station_name"`
	Accent       string `json:"player_accent"`
	AccentSoft   string `json:"player_accent_soft"`
	Theme        string `json:"player_theme"`
	Layout       string `json:"player_layout"`
	Ambient      bool   `json:"player_ambient"`
	ShowAbout    bool   `json:"player_show_about"`
	ShowHistory  bool   `json:"player_show_history"`
	ShowPlaylist bool   `json:"player_show_playlist"`
}

var validName = regexp.MustCompile(`^/[a-z0-9_\-]{1,64}$`)

// ErrNotFound is returned when a mount does not exist.
var ErrNotFound = errors.New("mount not found")

// ErrAlreadyExists is returned when a duplicate mount name is used.
var ErrAlreadyExists = errors.New("mount already exists")

// Manager holds all mounts and serialises them to disk.
type Manager struct {
	mu       sync.RWMutex
	mounts   map[string]*Mount // keyed by Mount.Name
	storeDir string
}

// NewManager creates a Manager backed by storeDir.
func NewManager(storeDir string) (*Manager, error) {
	if err := os.MkdirAll(storeDir, 0o750); err != nil {
		return nil, fmt.Errorf("mount: mkdir %q: %w", storeDir, err)
	}
	m := &Manager{
		mounts:   make(map[string]*Mount),
		storeDir: storeDir,
	}
	if err := m.load(); err != nil {
		return nil, err
	}
	return m, nil
}

// List returns a snapshot of all mounts.
func (m *Manager) List() []*Mount {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]*Mount, 0, len(m.mounts))
	for _, mt := range m.mounts {
		cp := *mt
		out = append(out, &cp)
	}
	return out
}

// Get returns a single mount by name.
func (m *Manager) Get(name string) (*Mount, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	mt, ok := m.mounts[name]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *mt
	return &cp, nil
}

// CreateRequest is the input DTO for creating a mount.
type CreateRequest struct {
	Name           string `json:"name"`
	Description    string `json:"description"`
	Genre          string `json:"genre"`
	Website        string `json:"website"`
	SourcePassword string `json:"source_password"`
	Bitrate        string `json:"bitrate"`
	Codec          string `json:"codec"`
	Protocol       string `json:"protocol"` // "HLS" (default) | "LL-HLS"
}

// Create adds a new mount.
func (m *Manager) Create(req CreateRequest) (*Mount, error) {
	if !validName.MatchString(req.Name) {
		return nil, fmt.Errorf("mount name must match %s", validName)
	}
	if len(req.SourcePassword) < 8 {
		return nil, errors.New("source_password must be at least 8 characters")
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.mounts[req.Name]; exists {
		return nil, ErrAlreadyExists
	}

	codec := strings.ToUpper(req.Codec)
	if codec == "" {
		codec = "AAC"
	}
	bitrate := req.Bitrate
	if bitrate == "" {
		bitrate = "128k"
	}
	protocol := strings.ToUpper(req.Protocol)
	if protocol != "LL-HLS" {
		protocol = "HLS"
	}

	mt := &Mount{
		ID:             newID(),
		Name:           req.Name,
		Description:    req.Description,
		Genre:          req.Genre,
		Website:        req.Website,
		SourcePassword: req.SourcePassword,
		Protocol:       protocol,
		Codec:          codec,
		Bitrate:        bitrate,
		Status:         StatusIdle,
		CreatedAt:      time.Now().UTC(),
		// Player defaults
		PlayerAccent:       "#E85D2F",
		PlayerAccentSoft:   "rgba(232,93,47,0.16)",
		PlayerTheme:        "dark",
		PlayerLayout:       "split",
		PlayerAmbient:      true,
		PlayerShowAbout:    true,
		PlayerShowHistory:  true,
		PlayerShowPlaylist: true,
	}
	m.mounts[mt.Name] = mt

	if err := m.persist(); err != nil {
		slog.Error("mount: persist after create", "err", err)
	}
	cp := *mt
	return &cp, nil
}

// Delete removes a mount by name.
func (m *Manager) Delete(name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.mounts[name]; !ok {
		return ErrNotFound
	}
	delete(m.mounts, name)
	if err := m.persist(); err != nil {
		slog.Error("mount: persist after delete", "err", err)
	}
	return nil
}

// SetStatus updates a mount's live status. Safe to call concurrently.
func (m *Manager) SetStatus(name string, s Status) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if mt, ok := m.mounts[name]; ok {
		mt.Status = s
	}
}

// SetListeners updates the listener count for a mount.
func (m *Manager) SetListeners(name string, n int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if mt, ok := m.mounts[name]; ok {
		mt.Listeners = n
	}
}

// UpdatePlayerConfig saves player customisation settings for a mount.
func (m *Manager) UpdatePlayerConfig(name string, cfg PlayerConfigUpdate) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	mt, ok := m.mounts[name]
	if !ok {
		return ErrNotFound
	}
	mt.PlayerStationName = cfg.StationName
	mt.PlayerAccent      = cfg.Accent
	mt.PlayerAccentSoft  = cfg.AccentSoft
	mt.PlayerTheme       = cfg.Theme
	mt.PlayerLayout      = cfg.Layout
	mt.PlayerAmbient     = cfg.Ambient
	mt.PlayerShowAbout   = cfg.ShowAbout
	mt.PlayerShowHistory = cfg.ShowHistory
	mt.PlayerShowPlaylist = cfg.ShowPlaylist
	if err := m.persist(); err != nil {
		slog.Error("mount: persist after player config update", "err", err)
	}
	return nil
}

// VerifySourcePassword returns true if password matches the mount's source password.
// Uses constant-time comparison to prevent timing attacks.
func (m *Manager) VerifySourcePassword(name, password string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	mt, ok := m.mounts[name]
	if !ok {
		return false
	}
	// Constant-time string comparison
	a := []byte(mt.SourcePassword)
	b := []byte(password)
	if len(a) != len(b) {
		return false
	}
	var diff byte
	for i := range a {
		diff |= a[i] ^ b[i]
	}
	return diff == 0
}

// storageMount is the on-disk representation (includes source password).
type storageMount struct {
	Mount
	SourcePassword string `json:"source_password"`
}

func (m *Manager) persist() error {
	list := make([]storageMount, 0, len(m.mounts))
	for _, mt := range m.mounts {
		list = append(list, storageMount{Mount: *mt, SourcePassword: mt.SourcePassword})
	}
	b, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	path := filepath.Join(m.storeDir, "mounts.json")
	// Write to temp file then rename for atomicity.
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (m *Manager) load() error {
	path := filepath.Join(m.storeDir, "mounts.json")
	b, err := os.ReadFile(filepath.Clean(path))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("mount: read %q: %w", path, err)
	}
	var list []storageMount
	if err := json.Unmarshal(b, &list); err != nil {
		return fmt.Errorf("mount: parse %q: %w", path, err)
	}
	for i := range list {
		mt := list[i].Mount
		mt.SourcePassword = list[i].SourcePassword
		mt.Listeners = 0 // runtime state, not persisted reliably
		m.mounts[mt.Name] = &mt
	}
	return nil
}

func newID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}
