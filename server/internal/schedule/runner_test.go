package schedule

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/riza/kast/internal/autodj"
	"github.com/riza/kast/internal/db"
	"github.com/riza/kast/internal/djmanager"
	"github.com/riza/kast/internal/library"
	"github.com/riza/kast/internal/mount"
	"github.com/riza/kast/internal/playlist"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeDJ records Start/Stop calls and reports a fabricated session state.
type fakeDJ struct {
	mu       sync.Mutex
	starts   []startCall
	stops    []string
	sessions map[string]*djmanager.SessionInfo
}

type startCall struct {
	mount      string
	playlistID string
	trackCount int
}

func newFakeDJ() *fakeDJ {
	return &fakeDJ{sessions: make(map[string]*djmanager.SessionInfo)}
}

func (f *fakeDJ) Start(_ context.Context, mountName, playlistID, _ string, _ func(string), tracks []*library.Track, _ autodj.Mode, _ int, _ autodj.JingleConfig) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.starts = append(f.starts, startCall{mountName, playlistID, len(tracks)})
	f.sessions[mountName] = &djmanager.SessionInfo{Mount: mountName, PlaylistID: playlistID}
	return nil
}

func (f *fakeDJ) Stop(mountName string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.stops = append(f.stops, mountName)
	delete(f.sessions, mountName)
	return nil
}

func (f *fakeDJ) GetSession(mountName string) *djmanager.SessionInfo {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.sessions[mountName]
}

func (f *fakeDJ) ResolveJingles(_ string, _ map[string]*library.Track) autodj.JingleConfig {
	return autodj.JingleConfig{}
}

// stubScanner returns a fixed track list. Used because the runner needs to
// resolve playlist TrackPaths against the library.
type stubScanner struct{ tracks []*library.Track }

func (s *stubScanner) Tracks() []*library.Track { return s.tracks }

// setup builds a runner with a fresh DB, one mount, one playlist (with one
// resolvable track), and one schedule covering Mon-Sun 06:00–10:00.
func setup(t *testing.T) (*Runner, *fakeDJ, *Schedule, *playlist.Manager) {
	t.Helper()
	d, err := db.Open(":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { d.Close() })

	mm, err := mount.NewManager(d)
	require.NoError(t, err)
	_, err = mm.Create(mount.CreateRequest{Name: "/radio1", SourcePassword: "pw123456"})
	require.NoError(t, err)

	pm, err := playlist.NewManager(d)
	require.NoError(t, err)
	pl, err := pm.Create(playlist.CreateRequest{
		Name:       "Morning",
		TrackPaths: []string{"/music/a.mp3"},
	})
	require.NoError(t, err)

	sm, err := NewManager(d, mm, pm)
	require.NoError(t, err)

	enabled := true
	s, err := sm.Create(CreateRequest{
		Name: "Morning Mix", Mount: "/radio1", PlaylistID: pl.ID,
		DaysMask: 0x7F, StartMinutes: 6 * 60, EndMinutes: 10 * 60, Enabled: &enabled,
	})
	require.NoError(t, err)

	fdj := newFakeDJ()
	scanner := &stubScanner{tracks: []*library.Track{{ID: "t1", Path: "/music/a.mp3"}}}

	r := &Runner{
		schedules:  sm,
		dj:         fdj,
		playlists:  pm,
		scanner:    scanner,
		webhooks:   nil,
		loc:        time.UTC,
		assignment: make(map[string]string),
	}
	return r, fdj, s, pm
}

// inWindow returns a fixed timestamp inside the 06:00–10:00 window on a
// weekday. Using a Wednesday in 2025 keeps Sun=bit 0 math straightforward.
func inWindow() time.Time {
	return time.Date(2025, 1, 15, 8, 0, 0, 0, time.UTC) // Wed 08:00 UTC
}

func outsideWindow() time.Time {
	return time.Date(2025, 1, 15, 12, 0, 0, 0, time.UTC) // Wed 12:00 UTC
}

// ── tick semantics ───────────────────────────────────────────────────────────

func TestTick_StartsWhenWindowOpens(t *testing.T) {
	r, fdj, s, _ := setup(t)

	r.tick(context.Background(), inWindow())

	require.Len(t, fdj.starts, 1)
	assert.Equal(t, "/radio1", fdj.starts[0].mount)
	assert.Equal(t, s.PlaylistID, fdj.starts[0].playlistID)
	assert.Equal(t, s.ID, r.assignment["/radio1"])
}

func TestTick_NoOpWhenAlreadyAssigned(t *testing.T) {
	r, fdj, _, _ := setup(t)

	r.tick(context.Background(), inWindow())
	require.Len(t, fdj.starts, 1)

	// Second tick within the same window: no new Start.
	r.tick(context.Background(), inWindow().Add(time.Minute))
	assert.Len(t, fdj.starts, 1)
}

func TestTick_StopsWhenWindowCloses(t *testing.T) {
	r, fdj, _, _ := setup(t)

	r.tick(context.Background(), inWindow())
	require.Len(t, fdj.starts, 1)

	r.tick(context.Background(), outsideWindow())
	require.Len(t, fdj.stops, 1)
	assert.Equal(t, "/radio1", fdj.stops[0])
	_, owned := r.assignment["/radio1"]
	assert.False(t, owned)
}

func TestTick_DoesNotStopUnownedMount(t *testing.T) {
	r, fdj, _, _ := setup(t)

	// Mount is idle, scheduler has no assignment. Outside the window: nothing
	// should happen.
	r.tick(context.Background(), outsideWindow())
	assert.Empty(t, fdj.starts)
	assert.Empty(t, fdj.stops)
}

func TestTick_AdoptsExistingSessionMatchingDesired(t *testing.T) {
	r, fdj, s, _ := setup(t)

	// Pretend djmanager already restored a session with the right playlist
	// (the boot-after-Restore scenario).
	fdj.sessions["/radio1"] = &djmanager.SessionInfo{Mount: "/radio1", PlaylistID: s.PlaylistID}

	r.tick(context.Background(), inWindow())
	assert.Empty(t, fdj.starts, "should adopt, not restart")
	assert.Equal(t, s.ID, r.assignment["/radio1"])
}

func TestTick_ReplacesExistingSessionWithDifferentPlaylist(t *testing.T) {
	r, fdj, _, _ := setup(t)

	// Restored session is on the right mount but with a different playlist —
	// scheduler must take over.
	fdj.sessions["/radio1"] = &djmanager.SessionInfo{Mount: "/radio1", PlaylistID: "other-playlist"}

	r.tick(context.Background(), inWindow())
	require.Len(t, fdj.starts, 1)
}

func TestTick_SkipsWhenPlaylistHasNoLibraryTracks(t *testing.T) {
	r, fdj, _, _ := setup(t)
	r.scanner = &stubScanner{tracks: nil} // no tracks resolvable

	r.tick(context.Background(), inWindow())
	assert.Empty(t, fdj.starts)
	_, owned := r.assignment["/radio1"]
	assert.False(t, owned, "skip should not claim ownership")
}

func TestTick_RespectsWeekdayBits(t *testing.T) {
	r, fdj, s, _ := setup(t)

	// Restrict schedule to Sunday only (bit 0).
	mask := uint8(1)
	_, err := r.schedules.Update(s.ID, UpdateRequest{DaysMask: &mask})
	require.NoError(t, err)

	r.tick(context.Background(), inWindow()) // a Wednesday
	assert.Empty(t, fdj.starts)
}

func TestTick_DisabledScheduleNeverFires(t *testing.T) {
	r, fdj, s, _ := setup(t)

	enabled := false
	_, err := r.schedules.Update(s.ID, UpdateRequest{Enabled: &enabled})
	require.NoError(t, err)

	r.tick(context.Background(), inWindow())
	assert.Empty(t, fdj.starts)
}

// ── desiredAssignments ───────────────────────────────────────────────────────

func TestDesiredAssignments_WindowIsHalfOpen(t *testing.T) {
	r, _, s, _ := setup(t)

	atStart := time.Date(2025, 1, 15, 6, 0, 0, 0, time.UTC)
	atEnd := time.Date(2025, 1, 15, 10, 0, 0, 0, time.UTC)

	startDesired := r.desiredAssignments(atStart)
	endDesired := r.desiredAssignments(atEnd)

	require.NotNil(t, startDesired["/radio1"], "start minute should be included")
	assert.Equal(t, s.ID, startDesired["/radio1"].ID)
	assert.Nil(t, endDesired["/radio1"], "end minute should be excluded (half-open)")
}
