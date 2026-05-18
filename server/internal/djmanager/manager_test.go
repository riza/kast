// White-box tests: same package so we can test unexported fields
// (history map, pushHistory) without requiring a full dependency graph.
package djmanager

import (
	"fmt"
	"sync"
	"testing"

	"github.com/riza/kast/internal/hls"
	"github.com/riza/kast/internal/library"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// minimalManager creates a Manager with only the fields needed for the methods
// under test (history, sessions). No segmenter, mounts, DB, or WebRTC required.
func minimalManager() *Manager {
	return &Manager{
		mu:       sync.Mutex{},
		sessions: make(map[string]*session),
		history:  make(map[string][]*library.Track),
		Trackers: hls.NewTrackerRegistry(),
	}
}

// ── pushHistory / RecentTracks ────────────────────────────────────────────────

func TestPushHistory_SingleEntry(t *testing.T) {
	m := minimalManager()
	m.pushHistory("/radio1", &library.Track{ID: "t1", Title: "Track 1"})

	h := m.RecentTracks("/radio1")
	require.Len(t, h, 1)
	assert.Equal(t, "t1", h[0].ID)
}

func TestPushHistory_NewestFirst(t *testing.T) {
	m := minimalManager()
	for i := 1; i <= 3; i++ {
		m.pushHistory("/radio1", &library.Track{ID: fmt.Sprintf("t%d", i)})
	}

	h := m.RecentTracks("/radio1")
	assert.Equal(t, "t3", h[0].ID)
	assert.Equal(t, "t2", h[1].ID)
	assert.Equal(t, "t1", h[2].ID)
}

func TestPushHistory_LimitToTen(t *testing.T) {
	m := minimalManager()
	for i := 1; i <= 15; i++ {
		m.pushHistory("/radio1", &library.Track{ID: fmt.Sprintf("t%d", i)})
	}

	h := m.RecentTracks("/radio1")
	assert.Len(t, h, 10)
	assert.Equal(t, "t15", h[0].ID) // newest
	assert.Equal(t, "t6", h[9].ID)  // oldest retained
}

func TestPushHistory_NoDuplicateConsecutive(t *testing.T) {
	m := minimalManager()
	t1 := &library.Track{ID: "t1"}
	m.pushHistory("/radio1", t1)
	m.pushHistory("/radio1", t1) // same track back-to-back

	h := m.RecentTracks("/radio1")
	assert.Len(t, h, 1)
}

func TestPushHistory_SameIDAfterOther(t *testing.T) {
	m := minimalManager()
	m.pushHistory("/radio1", &library.Track{ID: "t1"})
	m.pushHistory("/radio1", &library.Track{ID: "t2"})
	m.pushHistory("/radio1", &library.Track{ID: "t1"}) // t1 again — not consecutive

	h := m.RecentTracks("/radio1")
	assert.Len(t, h, 3) // t1 again is allowed since it's not immediately consecutive
}

func TestPushHistory_MountIsolation(t *testing.T) {
	m := minimalManager()
	m.pushHistory("/radio1", &library.Track{ID: "r1t1"})
	m.pushHistory("/radio2", &library.Track{ID: "r2t1"})

	assert.Equal(t, "r1t1", m.RecentTracks("/radio1")[0].ID)
	assert.Equal(t, "r2t1", m.RecentTracks("/radio2")[0].ID)
	assert.Len(t, m.RecentTracks("/radio1"), 1)
	assert.Len(t, m.RecentTracks("/radio2"), 1)
}

func TestRecentTracks_Empty(t *testing.T) {
	m := minimalManager()
	assert.Nil(t, m.RecentTracks("/radio1"))
}

// ── GetSession / ListSessions / IsRunning ────────────────────────────────────

func TestGetSession_NoSession(t *testing.T) {
	m := minimalManager()
	assert.Nil(t, m.GetSession("/radio1"))
}

func TestListSessions_Empty(t *testing.T) {
	m := minimalManager()
	assert.Empty(t, m.ListSessions())
}

func TestIsRunning_False(t *testing.T) {
	m := minimalManager()
	assert.False(t, m.IsRunning("/radio1"))
}

// ── NowPlaying ───────────────────────────────────────────────────────────────

func TestNowPlaying_NoSession(t *testing.T) {
	m := minimalManager()
	assert.Nil(t, m.NowPlaying("/radio1"))
}

// ── Error paths (no active session) ──────────────────────────────────────────

func TestSkip_NoSession(t *testing.T) {
	m := minimalManager()
	err := m.Skip("/radio1")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "/radio1")
}

func TestStop_NoSession(t *testing.T) {
	m := minimalManager()
	err := m.Stop("/radio1")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "/radio1")
}

func TestInsertNext_NoSession(t *testing.T) {
	m := minimalManager()
	err := m.InsertNext("/radio1", &library.Track{ID: "t1"})
	require.Error(t, err)
}

func TestJumpTo_NoSession(t *testing.T) {
	m := minimalManager()
	err := m.JumpTo("/radio1", 0)
	require.Error(t, err)
}

// ── Tracks ────────────────────────────────────────────────────────────────────

func TestTracks_NoSession(t *testing.T) {
	m := minimalManager()
	tracks, nowID, queue := m.Tracks("/radio1")
	assert.Nil(t, tracks)
	assert.Empty(t, nowID)
	assert.Nil(t, queue)
}

// ── RecentTracks snapshot ─────────────────────────────────────────────────────

func TestRecentTracks_ReturnsCopy(t *testing.T) {
	m := minimalManager()
	m.pushHistory("/radio1", &library.Track{ID: "t1"})

	h1 := m.RecentTracks("/radio1")
	h1[0] = nil // mutate returned slice

	h2 := m.RecentTracks("/radio1")
	assert.NotNil(t, h2[0], "RecentTracks should return a copy")
}
