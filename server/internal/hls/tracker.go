package hls

import (
	"log/slog"
	"path/filepath"
	"regexp"
	"strconv"
	"sync"

	"github.com/fsnotify/fsnotify"
)

// partFile matches ffmpeg LL-HLS partial segment filenames: seg00042_003.m4s
// Group 1 = segment sequence, Group 2 = part index (1-based).
var partFile = regexp.MustCompile(`^seg(\d+)_(\d+)\.m4s$`)

// segFile matches completed segment filenames: seg00042.m4s
var segFile = regexp.MustCompile(`^seg(\d+)\.m4s$`)

// PartState is a snapshot of the tracker's current position.
type PartState struct {
	MSN  int // media sequence number of the most recent complete or partial segment
	Part int // part index within that segment (0 = segment complete, no pending parts)
}

// Tracker watches a single mount directory and broadcasts whenever a new
// part or segment file appears. HTTP handlers wait on the Cond to implement
// LL-HLS blocking playlist reload.
type Tracker struct {
	mu      sync.Mutex
	cond    *sync.Cond
	current PartState
	watcher *fsnotify.Watcher
	dir     string
}

// NewTracker creates a Tracker for the given directory and starts the
// background fsnotify goroutine. Call Stop when done.
func NewTracker(dir string) (*Tracker, error) {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}
	if err := w.Add(dir); err != nil {
		w.Close()
		return nil, err
	}
	t := &Tracker{watcher: w, dir: dir}
	t.cond = sync.NewCond(&t.mu)
	go t.watch()
	return t, nil
}

// Stop shuts down the fsnotify watcher.
func (t *Tracker) Stop() {
	t.watcher.Close()
}

// State returns the current MSN and part index.
func (t *Tracker) State() PartState {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.current
}

// WaitFor blocks until the tracker's state satisfies (MSN > wantMSN) or
// (MSN == wantMSN && Part >= wantPart), then returns the current state.
// Returns immediately if the condition is already met.
func (t *Tracker) WaitFor(wantMSN, wantPart int) PartState {
	t.mu.Lock()
	defer t.mu.Unlock()
	for !t.ready(wantMSN, wantPart) {
		t.cond.Wait()
	}
	return t.current
}

func (t *Tracker) ready(wantMSN, wantPart int) bool {
	if t.current.MSN > wantMSN {
		return true
	}
	if t.current.MSN == wantMSN && t.current.Part >= wantPart {
		return true
	}
	return false
}

func (t *Tracker) watch() {
	for {
		select {
		case event, ok := <-t.watcher.Events:
			if !ok {
				return
			}
			if event.Op&(fsnotify.Create|fsnotify.Write) == 0 {
				continue
			}
			name := filepath.Base(event.Name)
			t.handleFile(name)

		case err, ok := <-t.watcher.Errors:
			if !ok {
				return
			}
			slog.Warn("hls tracker: fsnotify error", "err", err)
		}
	}
}

func (t *Tracker) handleFile(name string) {
	// Part file: seg00042_003.m4s → MSN=42, Part=3
	if m := partFile.FindStringSubmatch(name); m != nil {
		msn, _ := strconv.Atoi(m[1])
		part, _ := strconv.Atoi(m[2])
		t.update(msn, part)
		return
	}
	// Completed segment: seg00042.m4s → MSN=42, Part=0 (done)
	if m := segFile.FindStringSubmatch(name); m != nil {
		msn, _ := strconv.Atoi(m[1])
		t.update(msn, 0)
	}
}

func (t *Tracker) update(msn, part int) {
	t.mu.Lock()
	defer t.mu.Unlock()
	// Only advance — never go backwards.
	if msn > t.current.MSN || (msn == t.current.MSN && part > t.current.Part) {
		t.current = PartState{MSN: msn, Part: part}
		t.cond.Broadcast()
	}
}
