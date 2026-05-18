// Package webhook delivers HTTP event notifications to configured endpoints.
package webhook

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/google/uuid"
)

// ValidEvents is the set of event names Kast can emit.
var ValidEvents = map[string]bool{
	"mount.created":          true,
	"mount.deleted":          true,
	"mount.status.changed":   true,
	"mount.metadata.updated": true,
	"autodj.started":         true,
	"autodj.stopped":         true,
	"autodj.track.changed":   true,
	"autodj.track.skipped":   true,
	"listener.count.changed": true,
	"playlist.created":       true,
	"playlist.updated":       true,
	"playlist.deleted":       true,
	"schedule.created":       true,
	"schedule.updated":       true,
	"schedule.deleted":       true,
	"schedule.triggered":     true,
	"schedule.ended":         true,
	"schedule.skipped":       true,
}

// ErrNotFound is returned when a webhook ID does not exist.
var ErrNotFound = errors.New("webhook not found")

// Webhook is one registered HTTP endpoint.
type Webhook struct {
	ID        string    `json:"id"`
	URL       string    `json:"url"`
	Events    []string  `json:"events"`           // empty = receive all events
	Secret    string    `json:"secret,omitempty"` // HMAC-SHA256 signing key
	Enabled   bool      `json:"enabled"`
	CreatedAt time.Time `json:"created_at"`
}

// CreateRequest is the payload for POST /api/webhooks.
type CreateRequest struct {
	URL     string   `json:"url"`
	Events  []string `json:"events"`
	Secret  string   `json:"secret"`
	Enabled *bool    `json:"enabled"` // nil → true
}

// UpdateRequest is the payload for PATCH /api/webhooks/:id.
type UpdateRequest struct {
	URL     *string  `json:"url"`
	Events  []string `json:"events"`
	Secret  *string  `json:"secret"`
	Enabled *bool    `json:"enabled"`
}

// Manager stores webhooks in memory (loaded from SQLite) and delivers events.
type Manager struct {
	mu       sync.RWMutex
	webhooks map[string]*Webhook
	db       *sql.DB
	client   *http.Client
}

// NewManager loads existing webhooks from db and returns a ready Manager.
func NewManager(db *sql.DB) (*Manager, error) {
	m := &Manager{
		webhooks: make(map[string]*Webhook),
		db:       db,
		client:   &http.Client{Timeout: 10 * time.Second},
	}
	if err := m.load(); err != nil {
		return nil, err
	}
	return m, nil
}

func (m *Manager) load() error {
	rows, err := m.db.Query(
		`SELECT id, url, events, secret, enabled, created_at FROM webhooks`,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var wh Webhook
		var eventsJSON string
		var enabledInt int
		var createdAt string
		if err := rows.Scan(&wh.ID, &wh.URL, &eventsJSON, &wh.Secret, &enabledInt, &createdAt); err != nil {
			return err
		}
		_ = json.Unmarshal([]byte(eventsJSON), &wh.Events)
		wh.Enabled = enabledInt != 0
		wh.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
		m.webhooks[wh.ID] = &wh
	}
	return rows.Err()
}

// List returns a snapshot of all registered webhooks.
func (m *Manager) List() []*Webhook {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]*Webhook, 0, len(m.webhooks))
	for _, wh := range m.webhooks {
		cp := *wh
		out = append(out, &cp)
	}
	return out
}

// Get returns the webhook with the given ID.
func (m *Manager) Get(id string) (*Webhook, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	wh, ok := m.webhooks[id]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *wh
	return &cp, nil
}

// Create validates and persists a new webhook.
func (m *Manager) Create(req CreateRequest) (*Webhook, error) {
	if err := validateURL(req.URL); err != nil {
		return nil, err
	}
	if err := validateEvents(req.Events); err != nil {
		return nil, err
	}
	events := req.Events
	if events == nil {
		events = []string{}
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	wh := &Webhook{
		ID:        uuid.NewString(),
		URL:       req.URL,
		Events:    events,
		Secret:    req.Secret,
		Enabled:   enabled,
		CreatedAt: time.Now().UTC(),
	}
	eventsJSON, _ := json.Marshal(wh.Events)
	enabledInt := 0
	if wh.Enabled {
		enabledInt = 1
	}
	_, err := m.db.Exec(
		`INSERT INTO webhooks (id, url, events, secret, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		wh.ID, wh.URL, string(eventsJSON), wh.Secret, enabledInt, wh.CreatedAt.Format(time.RFC3339),
	)
	if err != nil {
		return nil, err
	}
	m.mu.Lock()
	m.webhooks[wh.ID] = wh
	m.mu.Unlock()
	cp := *wh
	return &cp, nil
}

// Update modifies an existing webhook. Only non-nil fields are changed.
func (m *Manager) Update(id string, req UpdateRequest) (*Webhook, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	wh, ok := m.webhooks[id]
	if !ok {
		return nil, ErrNotFound
	}
	if req.URL != nil {
		if err := validateURL(*req.URL); err != nil {
			return nil, err
		}
		wh.URL = *req.URL
	}
	if req.Events != nil {
		if err := validateEvents(req.Events); err != nil {
			return nil, err
		}
		wh.Events = req.Events
	}
	if req.Secret != nil {
		wh.Secret = *req.Secret
	}
	if req.Enabled != nil {
		wh.Enabled = *req.Enabled
	}
	eventsJSON, _ := json.Marshal(wh.Events)
	enabledInt := 0
	if wh.Enabled {
		enabledInt = 1
	}
	_, err := m.db.Exec(
		`UPDATE webhooks SET url=?, events=?, secret=?, enabled=? WHERE id=?`,
		wh.URL, string(eventsJSON), wh.Secret, enabledInt, wh.ID,
	)
	if err != nil {
		return nil, err
	}
	cp := *wh
	return &cp, nil
}

// Delete removes a webhook by ID.
func (m *Manager) Delete(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.webhooks[id]; !ok {
		return ErrNotFound
	}
	if _, err := m.db.Exec(`DELETE FROM webhooks WHERE id=?`, id); err != nil {
		return err
	}
	delete(m.webhooks, id)
	return nil
}

// Emit delivers event to all matching, enabled webhooks asynchronously.
func (m *Manager) Emit(event string, data any) {
	m.mu.RLock()
	var targets []*Webhook
	for _, wh := range m.webhooks {
		if wh.Enabled && matches(wh.Events, event) {
			cp := *wh
			targets = append(targets, &cp)
		}
	}
	m.mu.RUnlock()

	for _, wh := range targets {
		go m.deliver(wh, event, data)
	}
}

func (m *Manager) deliver(wh *Webhook, event string, data any) {
	payload := map[string]any{
		"id":        uuid.NewString(),
		"event":     event,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"data":      data,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		slog.Warn("webhook: marshal failed", "event", event, "err", err)
		return
	}

	req, err := http.NewRequest(http.MethodPost, wh.URL, bytes.NewReader(body))
	if err != nil {
		slog.Warn("webhook: build request failed", "url", wh.URL, "err", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "kast-webhook/1.0")

	if wh.Secret != "" {
		mac := hmac.New(sha256.New, []byte(wh.Secret))
		mac.Write(body)
		req.Header.Set("X-Kast-Signature", "sha256="+hex.EncodeToString(mac.Sum(nil)))
	}

	resp, err := m.client.Do(req)
	if err != nil {
		slog.Warn("webhook: delivery failed", "url", wh.URL, "event", event, "err", err)
		return
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		slog.Warn("webhook: non-2xx response", "url", wh.URL, "event", event, "status", resp.StatusCode)
	}
}

// matches reports whether event should be delivered to a webhook with the given events list.
// An empty events list means "all events".
func matches(events []string, event string) bool {
	if len(events) == 0 {
		return true
	}
	for _, e := range events {
		if e == event {
			return true
		}
	}
	return false
}

func validateURL(raw string) error {
	if raw == "" {
		return errors.New("url is required")
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return errors.New("url must use http or https scheme")
	}
	return nil
}

func validateEvents(events []string) error {
	for _, e := range events {
		if !ValidEvents[e] {
			return errors.New("unknown event: " + e)
		}
	}
	return nil
}
