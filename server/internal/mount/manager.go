// Package mount manages stream mount points.
package mount

import (
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
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
	Name           string    `json:"name"`
	Description    string    `json:"description"`
	Genre          string    `json:"genre"`
	Website        string    `json:"website"`
	SourcePassword string    `json:"-"`
	Protocol       string    `json:"protocol"`
	Codec          string    `json:"codec"`
	Bitrate        string    `json:"bitrate"`
	Status         Status    `json:"status"`
	Listeners      int       `json:"listeners"`
	CreatedAt      time.Time `json:"created_at"`

	PlayerStationName  string `json:"player_station_name"`
	PlayerAccent       string `json:"player_accent"`
	PlayerAccentSoft   string `json:"player_accent_soft"`
	PlayerTheme        string `json:"player_theme"`
	PlayerLayout       string `json:"player_layout"`
	PlayerAmbient      bool   `json:"player_ambient"`
	PlayerShowAbout    bool   `json:"player_show_about"`
	PlayerShowHistory  bool   `json:"player_show_history"`
	PlayerShowPlaylist bool   `json:"player_show_playlist"`
}

// MetadataUpdate is the DTO for updating a mount's editable metadata fields.
type MetadataUpdate struct {
	Description string `json:"description"`
	Genre       string `json:"genre"`
	Website     string `json:"website"`
	Codec       string `json:"codec"`
	Bitrate     string `json:"bitrate"`
	Protocol    string `json:"protocol"`
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
var validBitrate = regexp.MustCompile(`^\d{1,4}k$`)

// ValidCodec returns true if c is a supported codec.
func ValidCodec(c string) bool {
	switch c {
	case "AAC", "MP3", "OPUS":
		return true
	}
	return false
}

// ValidBitrate returns true if b matches the NNNk format (e.g. "128k").
func ValidBitrate(b string) bool {
	return validBitrate.MatchString(b)
}

// ErrNotFound is returned when a mount does not exist.
var ErrNotFound = errors.New("mount not found")

// ErrAlreadyExists is returned when a duplicate mount name is used.
var ErrAlreadyExists = errors.New("mount already exists")

// Manager holds all mounts in memory and persists them to SQLite.
type Manager struct {
	mu     sync.RWMutex
	mounts map[string]*Mount // keyed by Mount.Name; authoritative for reads
	db     *sql.DB
}

// NewManager creates a Manager backed by db.
func NewManager(db *sql.DB) (*Manager, error) {
	m := &Manager{
		mounts: make(map[string]*Mount),
		db:     db,
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
	Protocol       string `json:"protocol"`
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
	if !ValidCodec(codec) {
		return nil, fmt.Errorf("unsupported codec: %s (must be AAC, MP3, or OPUS)", codec)
	}
	bitrate := req.Bitrate
	if bitrate == "" {
		bitrate = "128k"
	}
	if !ValidBitrate(bitrate) {
		return nil, fmt.Errorf("invalid bitrate: %s (must match NNNk format)", bitrate)
	}
	protocol := strings.ToUpper(req.Protocol)
	if protocol != "LL-HLS" {
		protocol = "HLS"
	}

	pwHash, err := bcrypt.GenerateFromPassword([]byte(req.SourcePassword), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	mt := &Mount{
		ID:             newID(),
		Name:           req.Name,
		Description:    req.Description,
		Genre:          req.Genre,
		Website:        req.Website,
		SourcePassword: string(pwHash),
		Protocol:       protocol,
		Codec:          codec,
		Bitrate:        bitrate,
		Status:         StatusIdle,
		CreatedAt:      time.Now().UTC(),
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

	if err := m.insertDB(mt); err != nil {
		slog.Error("mount: db insert", "err", err)
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
	if _, err := m.db.Exec("DELETE FROM mounts WHERE name = ?", name); err != nil {
		slog.Error("mount: db delete", "err", err)
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
	mt.PlayerStationName  = cfg.StationName
	mt.PlayerAccent       = cfg.Accent
	mt.PlayerAccentSoft   = cfg.AccentSoft
	mt.PlayerTheme        = cfg.Theme
	mt.PlayerLayout       = cfg.Layout
	mt.PlayerAmbient      = cfg.Ambient
	mt.PlayerShowAbout    = cfg.ShowAbout
	mt.PlayerShowHistory  = cfg.ShowHistory
	mt.PlayerShowPlaylist = cfg.ShowPlaylist

	_, err := m.db.Exec(`
		UPDATE mounts SET
			player_station_name  = ?,
			player_accent        = ?,
			player_accent_soft   = ?,
			player_theme         = ?,
			player_layout        = ?,
			player_ambient       = ?,
			player_show_about    = ?,
			player_show_history  = ?,
			player_show_playlist = ?
		WHERE name = ?`,
		cfg.StationName, cfg.Accent, cfg.AccentSoft,
		cfg.Theme, cfg.Layout,
		btoi(cfg.Ambient), btoi(cfg.ShowAbout), btoi(cfg.ShowHistory), btoi(cfg.ShowPlaylist),
		name,
	)
	if err != nil {
		slog.Error("mount: db update player config", "err", err)
	}
	return nil
}

// UpdateMetadata saves editable metadata fields for a mount.
func (m *Manager) UpdateMetadata(name string, req MetadataUpdate) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	mt, ok := m.mounts[name]
	if !ok {
		return ErrNotFound
	}
	mt.Description = req.Description
	mt.Genre       = req.Genre
	mt.Website     = req.Website

	codec := strings.ToUpper(req.Codec)
	if codec != "" {
		if !ValidCodec(codec) {
			return fmt.Errorf("unsupported codec: %s (must be AAC, MP3, or OPUS)", codec)
		}
		mt.Codec = codec
	}
	bitrate := req.Bitrate
	if bitrate != "" {
		if !ValidBitrate(bitrate) {
			return fmt.Errorf("invalid bitrate: %s (must match NNNk format)", bitrate)
		}
		mt.Bitrate = bitrate
	}
	protocol := strings.ToUpper(req.Protocol)
	if protocol == "HLS" || protocol == "LL-HLS" {
		mt.Protocol = protocol
	}

	_, err := m.db.Exec(`
		UPDATE mounts SET description=?, genre=?, website=?, codec=?, bitrate=?, protocol=?
		WHERE name=?`,
		mt.Description, mt.Genre, mt.Website, mt.Codec, mt.Bitrate, mt.Protocol, name,
	)
	if err != nil {
		slog.Error("mount: db update metadata", "err", err)
	}
	return nil
}

// VerifySourcePassword returns true if password matches the mount's source password.
func (m *Manager) VerifySourcePassword(name, password string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	mt, ok := m.mounts[name]
	if !ok {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(mt.SourcePassword), []byte(password)) == nil
}

// ── internal ──────────────────────────────────────────────────────────────────

func (m *Manager) insertDB(mt *Mount) error {
	_, err := m.db.Exec(`
		INSERT INTO mounts (
			id, name, description, genre, website, source_password,
			protocol, codec, bitrate, created_at,
			player_station_name, player_accent, player_accent_soft,
			player_theme, player_layout,
			player_ambient, player_show_about, player_show_history, player_show_playlist
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		mt.ID, mt.Name, mt.Description, mt.Genre, mt.Website, mt.SourcePassword,
		mt.Protocol, mt.Codec, mt.Bitrate, mt.CreatedAt.UTC().Format(time.RFC3339),
		mt.PlayerStationName, mt.PlayerAccent, mt.PlayerAccentSoft,
		mt.PlayerTheme, mt.PlayerLayout,
		btoi(mt.PlayerAmbient), btoi(mt.PlayerShowAbout), btoi(mt.PlayerShowHistory), btoi(mt.PlayerShowPlaylist),
	)
	return err
}

func (m *Manager) load() error {
	rows, err := m.db.Query(`
		SELECT id, name, description, genre, website, source_password,
		       protocol, codec, bitrate, created_at,
		       player_station_name, player_accent, player_accent_soft,
		       player_theme, player_layout,
		       player_ambient, player_show_about, player_show_history, player_show_playlist
		FROM mounts`)
	if err != nil {
		return fmt.Errorf("mount: load: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var (
			mt                                               Mount
			createdAt                                        string
			ambient, showAbout, showHistory, showPlaylist    int
		)
		if err := rows.Scan(
			&mt.ID, &mt.Name, &mt.Description, &mt.Genre, &mt.Website, &mt.SourcePassword,
			&mt.Protocol, &mt.Codec, &mt.Bitrate, &createdAt,
			&mt.PlayerStationName, &mt.PlayerAccent, &mt.PlayerAccentSoft,
			&mt.PlayerTheme, &mt.PlayerLayout,
			&ambient, &showAbout, &showHistory, &showPlaylist,
		); err != nil {
			return fmt.Errorf("mount: load scan: %w", err)
		}
		mt.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
		mt.Status     = StatusIdle
		mt.PlayerAmbient      = ambient != 0
		mt.PlayerShowAbout    = showAbout != 0
		mt.PlayerShowHistory  = showHistory != 0
		mt.PlayerShowPlaylist = showPlaylist != 0
		cp := mt
		m.mounts[mt.Name] = &cp
	}
	return rows.Err()
}

func btoi(b bool) int {
	if b {
		return 1
	}
	return 0
}

func newID() string {
	return uuid.New().String()
}
