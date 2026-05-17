// Package library scans directories for audio files and reads their metadata.
package library

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Track represents a single audio file in the library.
type Track struct {
	ID         string    `json:"id"`
	Path       string    `json:"path"`
	Title      string    `json:"title"`
	Artist     string    `json:"artist"`
	Album      string    `json:"album"`
	Genre      string    `json:"genre"`
	DurationMs int64     `json:"duration_ms"`
	Bitrate    int       `json:"bitrate_kbps"`
	SizeBytes  int64     `json:"size_bytes"`
	Folder     string    `json:"folder"`
	AddedAt    time.Time `json:"added_at"`
}

// Scanner manages the in-memory track list and background scanning.
type Scanner struct {
	mu         sync.RWMutex
	tracks     []*Track
	scanDirs   []string
	extensions []string
	db         *sql.DB
}

// NewScanner creates a Scanner backed by db.
func NewScanner(scanDirs, extensions []string, db *sql.DB) (*Scanner, error) {
	s := &Scanner{
		scanDirs:   scanDirs,
		extensions: extensions,
		db:         db,
	}
	if err := s.load(); err != nil {
		slog.Warn("library: load from db failed", "err", err)
	}
	return s, nil
}

// PrimaryUploadDir returns the first configured scan directory.
func (s *Scanner) PrimaryUploadDir() string {
	if len(s.scanDirs) > 0 {
		return s.scanDirs[0]
	}
	return "./data/music"
}

// Tracks returns a copy of the current track list.
func (s *Scanner) Tracks() []*Track {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*Track, len(s.tracks))
	copy(out, s.tracks)
	return out
}

// UpdateTrack persists a metadata override for the track with the given ID
// and updates the in-memory record immediately. Overrides survive re-scans.
func (s *Scanner) UpdateTrack(id, title, artist, album, genre string) (*Track, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var target *Track
	for _, t := range s.tracks {
		if t.ID == id {
			target = t
			break
		}
	}
	if target == nil {
		return nil, fmt.Errorf("track not found: %s", id)
	}

	if _, err := s.db.Exec(`
		INSERT INTO track_overrides (path, title, artist, album, genre)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(path) DO UPDATE SET
			title  = excluded.title,
			artist = excluded.artist,
			album  = excluded.album,
			genre  = excluded.genre`,
		target.Path, title, artist, album, genre,
	); err != nil {
		return nil, fmt.Errorf("library: update track: %w", err)
	}

	target.Title  = title
	target.Artist = artist
	target.Album  = album
	target.Genre  = genre

	out := *target
	return &out, nil
}

// applyOverridesLocked merges stored metadata overrides into tracks.
// Must be called with s.mu held.
func (s *Scanner) applyOverridesLocked(tracks []*Track) {
	rows, err := s.db.Query(`SELECT path, title, artist, album, genre FROM track_overrides`)
	if err != nil {
		slog.Warn("library: load overrides", "err", err)
		return
	}
	defer rows.Close()

	type override struct{ title, artist, album, genre string }
	overrides := make(map[string]override)
	for rows.Next() {
		var path string
		var o override
		if err := rows.Scan(&path, &o.title, &o.artist, &o.album, &o.genre); err != nil {
			continue
		}
		overrides[path] = o
	}

	for _, t := range tracks {
		if o, ok := overrides[t.Path]; ok {
			t.Title  = o.title
			t.Artist = o.artist
			t.Album  = o.album
			t.Genre  = o.genre
		}
	}
}

// Scan walks all configured directories and updates the track list.
func (s *Scanner) Scan(ctx context.Context) error {
	var found []*Track
	now := time.Now().UTC()

	for _, dir := range s.scanDirs {
		dir = filepath.Clean(dir)

		err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				slog.Warn("library: walk error", "path", path, "err", err)
				return nil
			}
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if d.IsDir() {
				return nil
			}

			ext := strings.ToLower(filepath.Ext(path))
			if !slices.Contains(s.extensions, ext) {
				return nil
			}

			rel, err := filepath.Rel(dir, path)
			if err != nil || strings.HasPrefix(rel, "..") {
				slog.Warn("library: skipping path outside scan dir", "path", path)
				return nil
			}

			t, err := probeTrack(ctx, path, now)
			if err != nil {
				slog.Warn("library: probe failed", "path", path, "err", err)
				return nil
			}
			found = append(found, t)
			return nil
		})
		if err != nil {
			return fmt.Errorf("library: scan %q: %w", dir, err)
		}
	}

	s.mu.Lock()
	s.tracks = found
	s.applyOverridesLocked(found)
	s.mu.Unlock()

	if err := s.persist(found); err != nil {
		slog.Error("library: persist after scan", "err", err)
	}
	slog.Info("library: scan complete", "tracks", len(found))
	return nil
}

// ── internal ──────────────────────────────────────────────────────────────────

func (s *Scanner) persist(tracks []*Track) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("library: persist begin tx: %w", err)
	}

	// Replace entire track index atomically.
	if _, err := tx.Exec("DELETE FROM tracks"); err != nil {
		tx.Rollback()
		return err
	}
	for _, t := range tracks {
		if _, err := tx.Exec(`
			INSERT INTO tracks (id, path, title, artist, album, genre, duration_ms, bitrate_kbps, size_bytes, folder, added_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			t.ID, t.Path, t.Title, t.Artist, t.Album, t.Genre,
			t.DurationMs, t.Bitrate, t.SizeBytes, t.Folder,
			t.AddedAt.UTC().Format(time.RFC3339),
		); err != nil {
			slog.Warn("library: persist insert", "path", t.Path, "err", err)
		}
	}
	return tx.Commit()
}

func (s *Scanner) load() error {
	rows, err := s.db.Query(`
		SELECT id, path, title, artist, album, genre, duration_ms, bitrate_kbps, size_bytes, folder, added_at
		FROM tracks`)
	if err != nil {
		return err
	}
	defer rows.Close()

	var tracks []*Track
	for rows.Next() {
		var t Track
		var addedAt string
		if err := rows.Scan(
			&t.ID, &t.Path, &t.Title, &t.Artist, &t.Album, &t.Genre,
			&t.DurationMs, &t.Bitrate, &t.SizeBytes, &t.Folder, &addedAt,
		); err != nil {
			return err
		}
		t.AddedAt, _ = time.Parse(time.RFC3339, addedAt)
		tracks = append(tracks, &t)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	s.mu.Lock()
	s.tracks = tracks
	s.applyOverridesLocked(tracks)
	s.mu.Unlock()
	return nil
}

// ── ffprobe ───────────────────────────────────────────────────────────────────

type ffprobeOutput struct {
	Format struct {
		Filename string `json:"filename"`
		Duration string `json:"duration"`
		BitRate  string `json:"bit_rate"`
		Size     string `json:"size"`
		Tags     struct {
			Title  string `json:"title"`
			Artist string `json:"artist"`
			Album  string `json:"album"`
			Genre  string `json:"genre"`
		} `json:"tags"`
	} `json:"format"`
}

func probeTrack(ctx context.Context, path string, addedAt time.Time) (*Track, error) {
	// #nosec G204 — args are a fixed list; path is already cleaned and validated.
	cmd := exec.CommandContext(ctx,
		"ffprobe",
		"-v", "quiet",
		"-print_format", "json",
		"-show_format",
		path,
	)
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("ffprobe: %w", err)
	}

	var probe ffprobeOutput
	if err := json.Unmarshal(out, &probe); err != nil {
		return nil, fmt.Errorf("ffprobe parse: %w", err)
	}

	f := probe.Format
	var durMs int64
	var dur float64
	fmt.Sscanf(f.Duration, "%f", &dur)
	durMs = int64(dur * 1000)

	var bitrate int
	fmt.Sscanf(f.BitRate, "%d", &bitrate)
	bitrate /= 1000

	var size int64
	fmt.Sscanf(f.Size, "%d", &size)

	title := f.Tags.Title
	if title == "" {
		title = strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	}

	return &Track{
		ID:         trackID(),
		Path:       path,
		Title:      title,
		Artist:     f.Tags.Artist,
		Album:      f.Tags.Album,
		Genre:      f.Tags.Genre,
		DurationMs: durMs,
		Bitrate:    bitrate,
		SizeBytes:  size,
		Folder:     filepath.Dir(path),
		AddedAt:    addedAt,
	}, nil
}

func trackID() string {
	return uuid.New().String()
}
