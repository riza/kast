package hls

import (
	"sync"
)

// TrackerRegistry manages one Tracker per LL-HLS mount.
type TrackerRegistry struct {
	mu       sync.Mutex
	trackers map[string]*Tracker // key = mount dir path
}

// NewTrackerRegistry creates an empty registry.
func NewTrackerRegistry() *TrackerRegistry {
	return &TrackerRegistry{trackers: make(map[string]*Tracker)}
}

// Start creates a Tracker for the given directory, replacing any existing one.
func (r *TrackerRegistry) Start(dir string) (*Tracker, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if old, ok := r.trackers[dir]; ok {
		old.Stop()
	}
	t, err := NewTracker(dir)
	if err != nil {
		return nil, err
	}
	r.trackers[dir] = t
	return t, nil
}

// Stop shuts down and removes the tracker for the given directory.
func (r *TrackerRegistry) Stop(dir string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if t, ok := r.trackers[dir]; ok {
		t.Stop()
		delete(r.trackers, dir)
	}
}

// Get returns the tracker for a directory, or nil if not found.
func (r *TrackerRegistry) Get(dir string) *Tracker {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.trackers[dir]
}
