// Package apikey manages dynamic API keys stored in SQLite.
package apikey

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"strings"
	"sync"
	"time"
)

var (
	ErrNotFound = errors.New("api key not found")
	ErrDisabled = errors.New("api key disabled")
	ErrExpired  = errors.New("api key expired")
)

// APIKey is the public (non-secret) representation of a key.
type APIKey struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Prefix      string     `json:"prefix"`
	CreatedAt   time.Time  `json:"created_at"`
	LastUsedAt  *time.Time `json:"last_used_at"`
	ExpiresAt   *time.Time `json:"expires_at"`
	Enabled     bool       `json:"enabled"`
	IPAllowlist []string   `json:"ip_allowlist"`
}

// CreateRequest is the payload for POST /api/apikeys.
type CreateRequest struct {
	Name        string   `json:"name"`
	ExpiresAt   *string  `json:"expires_at"`
	IPAllowlist []string `json:"ip_allowlist"`
}

// CreateResponse includes the plaintext key — returned only at creation time.
type CreateResponse struct {
	APIKey
	Key string `json:"key"`
}

// UpdateRequest is the payload for PATCH /api/apikeys/:id.
type UpdateRequest struct {
	Name        *string  `json:"name"`
	Enabled     *bool    `json:"enabled"`
	IPAllowlist []string `json:"ip_allowlist"`
	ExpiresAt   *string  `json:"expires_at"`
}

// Manager stores and looks up API keys.
type Manager struct {
	db     *sql.DB
	mu     sync.RWMutex
	byHash map[string]*APIKey // sha256-hex → *APIKey
	byID   map[string]*APIKey // id → *APIKey
}

// NewManager loads all keys from DB and returns a ready Manager.
func NewManager(db *sql.DB) (*Manager, error) {
	m := &Manager{
		db:     db,
		byHash: make(map[string]*APIKey),
		byID:   make(map[string]*APIKey),
	}
	rows, err := db.Query(`SELECT id, name, key_hash, prefix, created_at, last_used_at, expires_at, enabled, ip_allowlist FROM api_keys`)
	if err != nil {
		return nil, fmt.Errorf("apikey: load: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		k, hash, err := scanRow(rows)
		if err != nil {
			return nil, fmt.Errorf("apikey: scan: %w", err)
		}
		m.byHash[hash] = k
		m.byID[k.ID] = k
	}
	return m, rows.Err()
}

// List returns all keys (no plaintext).
func (m *Manager) List() []*APIKey {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]*APIKey, 0, len(m.byID))
	for _, k := range m.byID {
		cp := *k
		out = append(out, &cp)
	}
	return out
}

// Create generates a new random key, hashes it, persists it, and returns the
// plaintext key once (it is not stored).
func (m *Manager) Create(req CreateRequest) (*CreateResponse, error) {
	if req.Name == "" {
		return nil, errors.New("name is required")
	}
	if req.IPAllowlist == nil {
		req.IPAllowlist = []string{}
	}
	if err := validateCIDRs(req.IPAllowlist); err != nil {
		return nil, err
	}

	rawBytes := make([]byte, 32)
	if _, err := rand.Read(rawBytes); err != nil {
		return nil, fmt.Errorf("apikey: rand: %w", err)
	}
	rawKey := hex.EncodeToString(rawBytes)
	hash := hashKey(rawKey)
	prefix := rawKey[:8]

	idBytes := make([]byte, 8)
	if _, err := rand.Read(idBytes); err != nil {
		return nil, fmt.Errorf("apikey: rand id: %w", err)
	}
	id := hex.EncodeToString(idBytes)

	now := time.Now().UTC()
	k := &APIKey{
		ID:          id,
		Name:        req.Name,
		Prefix:      prefix,
		CreatedAt:   now,
		Enabled:     true,
		IPAllowlist: req.IPAllowlist,
	}

	var expiresAt *time.Time
	if req.ExpiresAt != nil && *req.ExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, *req.ExpiresAt)
		if err != nil {
			// Try date-only format
			t, err = time.Parse("2006-01-02", *req.ExpiresAt)
			if err != nil {
				return nil, errors.New("expires_at must be RFC3339 or YYYY-MM-DD")
			}
			t = time.Date(t.Year(), t.Month(), t.Day(), 23, 59, 59, 0, time.UTC)
		}
		expiresAt = &t
		k.ExpiresAt = expiresAt
	}

	allowlistJSON, _ := json.Marshal(req.IPAllowlist)

	var expiresAtStr *string
	if expiresAt != nil {
		s := expiresAt.Format(time.RFC3339)
		expiresAtStr = &s
	}

	_, err := m.db.Exec(
		`INSERT INTO api_keys (id, name, key_hash, prefix, created_at, expires_at, enabled, ip_allowlist) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
		id, req.Name, hash, prefix, now.Format(time.RFC3339), expiresAtStr, string(allowlistJSON),
	)
	if err != nil {
		return nil, fmt.Errorf("apikey: insert: %w", err)
	}

	m.mu.Lock()
	m.byHash[hash] = k
	m.byID[id] = k
	m.mu.Unlock()

	return &CreateResponse{APIKey: *k, Key: rawKey}, nil
}

// Update partially updates a key.
func (m *Manager) Update(id string, req UpdateRequest) (*APIKey, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	k, ok := m.byID[id]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *k

	if req.Name != nil && *req.Name != "" {
		cp.Name = *req.Name
	}
	if req.Enabled != nil {
		cp.Enabled = *req.Enabled
	}
	if req.IPAllowlist != nil {
		if err := validateCIDRs(req.IPAllowlist); err != nil {
			return nil, err
		}
		cp.IPAllowlist = req.IPAllowlist
	}
	if req.ExpiresAt != nil {
		if *req.ExpiresAt == "" {
			cp.ExpiresAt = nil
		} else {
			t, err := time.Parse(time.RFC3339, *req.ExpiresAt)
			if err != nil {
				t, err = time.Parse("2006-01-02", *req.ExpiresAt)
				if err != nil {
					return nil, errors.New("expires_at must be RFC3339 or YYYY-MM-DD")
				}
				t = time.Date(t.Year(), t.Month(), t.Day(), 23, 59, 59, 0, time.UTC)
			}
			cp.ExpiresAt = &t
		}
	}

	allowlistJSON, _ := json.Marshal(cp.IPAllowlist)
	var expiresAtStr *string
	if cp.ExpiresAt != nil {
		s := cp.ExpiresAt.Format(time.RFC3339)
		expiresAtStr = &s
	}
	enabledInt := 0
	if cp.Enabled {
		enabledInt = 1
	}

	_, err := m.db.Exec(
		`UPDATE api_keys SET name=?, enabled=?, ip_allowlist=?, expires_at=? WHERE id=?`,
		cp.Name, enabledInt, string(allowlistJSON), expiresAtStr, id,
	)
	if err != nil {
		return nil, fmt.Errorf("apikey: update: %w", err)
	}

	// Update in-memory maps
	// Find the hash for this key to update byHash too
	for h, v := range m.byHash {
		if v.ID == id {
			m.byHash[h] = &cp
			break
		}
	}
	m.byID[id] = &cp

	result := cp
	return &result, nil
}

// Delete removes a key permanently.
func (m *Manager) Delete(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.byID[id]; !ok {
		return ErrNotFound
	}

	if _, err := m.db.Exec(`DELETE FROM api_keys WHERE id=?`, id); err != nil {
		return fmt.Errorf("apikey: delete: %w", err)
	}

	for h, v := range m.byHash {
		if v.ID == id {
			delete(m.byHash, h)
			break
		}
	}
	delete(m.byID, id)
	return nil
}

// Lookup finds a key by raw plaintext, validates enabled/expiry, and touches
// last_used_at asynchronously.
func (m *Manager) Lookup(rawKey string) (*APIKey, error) {
	hash := hashKey(rawKey)

	m.mu.RLock()
	k, ok := m.byHash[hash]
	m.mu.RUnlock()

	if !ok {
		return nil, ErrNotFound
	}
	if !k.Enabled {
		return nil, ErrDisabled
	}
	if k.ExpiresAt != nil && time.Now().UTC().After(*k.ExpiresAt) {
		return nil, ErrExpired
	}

	cp := *k // copy before goroutine can write k.LastUsedAt
	go m.touchLastUsed(k.ID)
	return &cp, nil
}

func (m *Manager) touchLastUsed(id string) {
	now := time.Now().UTC()
	nowStr := now.Format(time.RFC3339)
	if _, err := m.db.Exec(`UPDATE api_keys SET last_used_at=? WHERE id=?`, nowStr, id); err != nil {
		return
	}
	m.mu.Lock()
	if k, ok := m.byID[id]; ok {
		t := now
		k.LastUsedAt = &t
		for h, v := range m.byHash {
			if v.ID == id {
				m.byHash[h] = k
				break
			}
		}
	}
	m.mu.Unlock()
}

// ValidateIP returns true if ip is in any of the key's allowed CIDRs, or if
// the allowlist is empty (allow all).
func (m *Manager) ValidateIP(k *APIKey, ip string) bool {
	if len(k.IPAllowlist) == 0 {
		return true
	}
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return false
	}
	for _, cidr := range k.IPAllowlist {
		_, ipNet, err := net.ParseCIDR(normalizeCIDR(cidr))
		if err != nil {
			continue
		}
		if ipNet.Contains(parsed) {
			return true
		}
	}
	return false
}

func hashKey(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func normalizeCIDR(s string) string {
	if strings.Contains(s, "/") {
		return s
	}
	if ip := net.ParseIP(s); ip != nil {
		if ip.To4() != nil {
			return s + "/32"
		}
		return s + "/128"
	}
	return s
}

func validateCIDRs(cidrs []string) error {
	for _, cidr := range cidrs {
		_, _, err := net.ParseCIDR(normalizeCIDR(cidr))
		if err != nil {
			return fmt.Errorf("invalid IP/CIDR %q: %w", cidr, err)
		}
	}
	return nil
}

type scanner interface {
	Scan(dest ...any) error
}

func scanRow(rows scanner) (*APIKey, string, error) {
	var (
		id, name, hash, prefix, createdAtStr string
		lastUsedAtStr, expiresAtStr          *string
		enabled                              int
		allowlistJSON                        string
	)
	if err := rows.Scan(&id, &name, &hash, &prefix, &createdAtStr, &lastUsedAtStr, &expiresAtStr, &enabled, &allowlistJSON); err != nil {
		return nil, "", err
	}

	createdAt, _ := time.Parse(time.RFC3339, createdAtStr)

	var lastUsedAt *time.Time
	if lastUsedAtStr != nil {
		t, _ := time.Parse(time.RFC3339, *lastUsedAtStr)
		lastUsedAt = &t
	}

	var expiresAt *time.Time
	if expiresAtStr != nil {
		t, _ := time.Parse(time.RFC3339, *expiresAtStr)
		expiresAt = &t
	}

	var allowlist []string
	if err := json.Unmarshal([]byte(allowlistJSON), &allowlist); err != nil {
		slog.Warn("apikey: load: corrupt allowlist JSON", "id", id, "err", err)
	}
	if allowlist == nil {
		allowlist = []string{}
	}

	k := &APIKey{
		ID:          id,
		Name:        name,
		Prefix:      prefix,
		CreatedAt:   createdAt,
		LastUsedAt:  lastUsedAt,
		ExpiresAt:   expiresAt,
		Enabled:     enabled == 1,
		IPAllowlist: allowlist,
	}
	return k, hash, nil
}
