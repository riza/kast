// Package ytimport downloads audio from YouTube using yt-dlp and
// adds the resulting files to the configured music library.
package ytimport

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/riza/kast/internal/library"
)

// JobStatus describes the lifecycle of an import job.
type JobStatus string

const (
	StatusPending     JobStatus = "pending"
	StatusDownloading JobStatus = "downloading"
	StatusDone        JobStatus = "done"
	StatusError       JobStatus = "error"
)

// Item is one track within an import job.
type Item struct {
	YTID       string    `json:"ytid"`
	Title      string    `json:"title"`
	Artist     string    `json:"artist"`
	DurationMs int64     `json:"duration_ms"`
	Thumbnail  string    `json:"thumbnail"`
	Status     JobStatus `json:"status"`
	Progress   float64   `json:"progress"` // 0–100
	Err        string    `json:"error,omitempty"`
	Path       string    `json:"path,omitempty"` // absolute path after successful download
}

// Job tracks a single import request (one or more items).
type Job struct {
	ID        string    `json:"id"`
	Status    JobStatus `json:"status"`
	Items     []*Item   `json:"items"`
	CreatedAt time.Time `json:"created_at"`
}

// PreviewResult is returned by Preview.
type PreviewResult struct {
	Type  string  `json:"type"`  // "video" or "playlist"
	Title string  `json:"title"` // playlist title; empty for single video
	Items []*Item `json:"items"`
}

// Manager handles YouTube import jobs.
type Manager struct {
	mu        sync.RWMutex
	jobs      map[string]*Job
	outputDir string // directory where audio files are saved
	scanner   *library.Scanner
}

// NewManager creates a Manager that saves files to outputDir.
func NewManager(outputDir string, scanner *library.Scanner) *Manager {
	return &Manager{
		jobs:      make(map[string]*Job),
		outputDir: outputDir,
		scanner:   scanner,
	}
}

// ytFlatEntry is the minimal yt-dlp JSON shape we care about.
type ytFlatEntry struct {
	ID            string  `json:"id"`
	Title         string  `json:"title"`
	Duration      float64 `json:"duration"`
	Thumbnail     string  `json:"thumbnail"`
	Uploader      string  `json:"uploader"`
	Channel       string  `json:"channel"`
	Artist        string  `json:"artist"`
	PlaylistTitle string  `json:"playlist_title"`
	Thumbnails    []struct {
		URL string `json:"url"`
	} `json:"thumbnails"`
}

func (e *ytFlatEntry) artist() string {
	if e.Artist != "" {
		return e.Artist
	}
	if e.Uploader != "" {
		return e.Uploader
	}
	return e.Channel
}

func (e *ytFlatEntry) thumbnail() string {
	if e.Thumbnail != "" {
		return e.Thumbnail
	}
	if len(e.Thumbnails) > 0 {
		return e.Thumbnails[len(e.Thumbnails)-1].URL
	}
	return ""
}

// Preview fetches metadata for a YouTube URL without downloading.
// Supports single video and playlist URLs.
func (m *Manager) Preview(ctx context.Context, rawURL string) (*PreviewResult, error) {
	// --flat-playlist makes playlist previews fast (no per-video API round trips).
	// #nosec G204 — URL is passed as a single argument; no shell interpolation.
	cmd := exec.CommandContext(ctx,
		"yt-dlp",
		"--flat-playlist",
		"--dump-json",
		"--js-runtimes", "node",
		rawURL,
	)
	var stderr strings.Builder
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		detail := strings.TrimSpace(stderr.String())
		if detail == "" {
			detail = err.Error()
		}
		return nil, fmt.Errorf("yt-dlp: %s", detail)
	}

	var items []*Item
	var playlistTitle string

	sc := bufio.NewScanner(strings.NewReader(string(out)))
	sc.Buffer(make([]byte, 1<<20), 1<<20) // 1 MiB line buffer for large JSON objects
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var entry ytFlatEntry
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			continue
		}
		if entry.ID == "" {
			continue
		}
		if entry.PlaylistTitle != "" && playlistTitle == "" {
			playlistTitle = entry.PlaylistTitle
		}
		items = append(items, &Item{
			YTID:       entry.ID,
			Title:      entry.Title,
			Artist:     entry.artist(),
			DurationMs: int64(entry.Duration * 1000),
			Thumbnail:  entry.thumbnail(),
			Status:     StatusPending,
		})
	}

	if len(items) == 0 {
		return nil, fmt.Errorf("yt-dlp: no entries found for %q", rawURL)
	}

	kind := "video"
	if len(items) > 1 {
		kind = "playlist"
	}

	return &PreviewResult{
		Type:  kind,
		Title: playlistTitle,
		Items: items,
	}, nil
}

// StartImport begins downloading items in the background and returns a job ID.
// items should come from a Preview call, possibly filtered by the user.
func (m *Manager) StartImport(items []*Item) string {
	id := fmt.Sprintf("%d", time.Now().UnixNano())

	copies := make([]*Item, len(items))
	for i, it := range items {
		cp := *it
		cp.Status = StatusPending
		cp.Progress = 0
		copies[i] = &cp
	}

	job := &Job{
		ID:        id,
		Status:    StatusDownloading,
		Items:     copies,
		CreatedAt: time.Now(),
	}

	m.mu.Lock()
	m.jobs[id] = job
	m.mu.Unlock()

	go m.runJob(job)
	return id
}

// GetJob returns a snapshot of the job or nil if not found.
func (m *Manager) GetJob(id string) *Job {
	m.mu.RLock()
	j := m.jobs[id]
	m.mu.RUnlock()
	if j == nil {
		return nil
	}
	return copyJob(j)
}

// ListJobs returns snapshots of all jobs ordered from newest to oldest.
func (m *Manager) ListJobs() []*Job {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]*Job, 0, len(m.jobs))
	for _, j := range m.jobs {
		out = append(out, copyJob(j))
	}
	// Sort newest first by CreatedAt.
	for i := 0; i < len(out)-1; i++ {
		for j := i + 1; j < len(out); j++ {
			if out[j].CreatedAt.After(out[i].CreatedAt) {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out
}

func copyJob(j *Job) *Job {
	items := make([]*Item, len(j.Items))
	for i, it := range j.Items {
		cp := *it
		items[i] = &cp
	}
	return &Job{
		ID:        j.ID,
		Status:    j.Status,
		Items:     items,
		CreatedAt: j.CreatedAt,
	}
}

var progressRe = regexp.MustCompile(`\[download\]\s+(\d+(?:\.\d+)?)%`)

func (m *Manager) runJob(job *Job) {
	const maxConcurrent = 3
	sem := make(chan struct{}, maxConcurrent)
	var wg sync.WaitGroup

	for _, item := range job.Items {
		wg.Add(1)
		go func(it *Item) {
			defer wg.Done()
			sem <- struct{}{}        // acquire slot
			defer func() { <-sem }() // release slot
			if err := m.downloadItem(job, it); err != nil {
				slog.Error("ytimport: download error", "ytid", it.YTID, "title", it.Title, "err", err)
			}
		}(item)
	}

	wg.Wait()

	m.mu.Lock()
	allOK := true
	for _, it := range job.Items {
		if it.Status != StatusDone {
			allOK = false
			break
		}
	}
	if allOK {
		job.Status = StatusDone
	} else {
		job.Status = StatusError
	}
	m.mu.Unlock()

	// Trigger a library rescan so new files appear immediately.
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		if err := m.scanner.Scan(ctx); err != nil {
			slog.Error("ytimport: library rescan failed", "err", err)
		}
	}()
}

func (m *Manager) downloadItem(job *Job, item *Item) error {
	_ = job // reserved for future per-job cancellation

	m.mu.Lock()
	item.Status = StatusDownloading
	m.mu.Unlock()

	videoURL := "https://www.youtube.com/watch?v=" + item.YTID

	// Output template: "<Title>.mp3" in the configured output directory.
	// --windows-filenames removes characters that are invalid on Windows/some FS.
	outTpl := filepath.Join(m.outputDir, "%(title)s.%(ext)s")

	// #nosec G204 — videoURL is constructed from a validated YouTube ID; no shell expansion.
	cmd := exec.CommandContext(context.Background(),
		"yt-dlp",
		"-x",
		"--audio-format", "mp3",
		"--audio-quality", "0",
		"--embed-thumbnail",
		"--embed-metadata",
		"--output", outTpl,
		"--progress",
		"--newline",
		"--no-playlist",
		"--windows-filenames",
		"--js-runtimes", "node",
		"--print", "after_move:filepath",
		videoURL,
	)
	cmd.Stderr = os.Stderr

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		m.mu.Lock()
		item.Status = StatusError
		item.Err = err.Error()
		m.mu.Unlock()
		return err
	}

	if err := cmd.Start(); err != nil {
		m.mu.Lock()
		item.Status = StatusError
		item.Err = err.Error()
		m.mu.Unlock()
		return err
	}

	var downloadedPath string
	sc := bufio.NewScanner(stdout)
	for sc.Scan() {
		line := sc.Text()
		if match := progressRe.FindStringSubmatch(line); len(match) == 2 {
			pct, _ := strconv.ParseFloat(match[1], 64)
			m.mu.Lock()
			item.Progress = pct
			m.mu.Unlock()
		} else if s := strings.TrimSpace(line); strings.HasSuffix(s, ".mp3") {
			downloadedPath = s
		}
	}

	if err := cmd.Wait(); err != nil {
		m.mu.Lock()
		item.Status = StatusError
		item.Err = err.Error()
		m.mu.Unlock()
		return err
	}

	m.mu.Lock()
	item.Status = StatusDone
	item.Progress = 100
	item.Path = downloadedPath
	m.mu.Unlock()
	return nil
}
