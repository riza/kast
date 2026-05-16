// Package library scans directories for audio files and reads their metadata.
package library

import (
	"context"
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
	storeDir   string
}

// NewScanner creates a Scanner. storeDir is used to persist the track index.
func NewScanner(scanDirs, extensions []string, storeDir string) (*Scanner, error) {
	if err := os.MkdirAll(storeDir, 0o750); err != nil {
		return nil, fmt.Errorf("library: mkdir %q: %w", storeDir, err)
	}
	s := &Scanner{
		scanDirs:   scanDirs,
		extensions: extensions,
		storeDir:   storeDir,
	}
	_ = s.load() // best-effort; ignore if no saved index
	return s, nil
}

// PrimaryUploadDir returns the first configured scan directory, used as the
// destination for browser-uploaded files. Falls back to "./data/music".
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

// Scan walks all configured directories and updates the track list.
// ctx may be used to cancel a long scan.
func (s *Scanner) Scan(ctx context.Context) error {
	var found []*Track
	now := time.Now().UTC()

	for _, dir := range s.scanDirs {
		// Guard against path traversal: ensure dir is clean.
		dir = filepath.Clean(dir)

		err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				slog.Warn("library: walk error", "path", path, "err", err)
				return nil // keep walking
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

			// Ensure path is inside the intended scan directory.
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
	s.mu.Unlock()

	if err := s.persist(); err != nil {
		slog.Error("library: persist after scan", "err", err)
	}
	slog.Info("library: scan complete", "tracks", len(found))
	return nil
}

// ffprobeOutput is the minimal subset of ffprobe's JSON we need.
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

// probeTrack runs ffprobe on path and returns a Track.
// Arguments are passed explicitly — no shell interpolation.
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
	bitrate /= 1000 // bps → kbps

	var size int64
	fmt.Sscanf(f.Size, "%d", &size)

	title := f.Tags.Title
	if title == "" {
		title = strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	}

	return &Track{
		ID:         trackID(path),
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

func trackID(path string) string {
	// Simple deterministic ID from path — good enough for v1.
	return fmt.Sprintf("%x", []byte(path))[:16]
}

func (s *Scanner) persist() error {
	s.mu.RLock()
	tracks := make([]*Track, len(s.tracks))
	copy(tracks, s.tracks)
	s.mu.RUnlock()

	b, err := json.MarshalIndent(tracks, "", "  ")
	if err != nil {
		return err
	}
	path := filepath.Join(s.storeDir, "library.json")
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (s *Scanner) load() error {
	path := filepath.Join(s.storeDir, "library.json")
	b, err := os.ReadFile(filepath.Clean(path))
	if err != nil {
		return err
	}
	var tracks []*Track
	if err := json.Unmarshal(b, &tracks); err != nil {
		return err
	}
	s.mu.Lock()
	s.tracks = tracks
	s.mu.Unlock()
	return nil
}
