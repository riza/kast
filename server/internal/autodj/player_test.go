package autodj_test

import (
	"fmt"
	"testing"

	"github.com/riza/kast/internal/autodj"
	"github.com/riza/kast/internal/library"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func makeTracks(n int) []*library.Track {
	tracks := make([]*library.Track, n)
	for i := range tracks {
		tracks[i] = &library.Track{
			ID:    fmt.Sprintf("track-%d", i+1),
			Path:  fmt.Sprintf("/music/track%d.mp3", i+1),
			Title: fmt.Sprintf("Track %d", i+1),
		}
	}
	return tracks
}

// ── Initial state ─────────────────────────────────────────────────────────────

func TestNewPlayer_NotRunning(t *testing.T) {
	p := autodj.NewPlayer(nil, autodj.ModeSequential, 0, "", nil)
	assert.False(t, p.IsRunning())
}

func TestNewPlayer_NowPlaying_Nil(t *testing.T) {
	p := autodj.NewPlayer(makeTracks(3), autodj.ModeSequential, 0, "", nil)
	assert.Nil(t, p.NowPlaying())
}

func TestNewPlayer_EmptyTracks(t *testing.T) {
	p := autodj.NewPlayer(nil, autodj.ModeSequential, 0, "", nil)
	tracks, nowID, queue := p.Tracks()
	assert.Empty(t, tracks)
	assert.Empty(t, nowID)
	assert.Empty(t, queue)
}

func TestNewPlayer_StartFromPath(t *testing.T) {
	tracks := makeTracks(4)
	// Start from track2 → player resumes from the track after it.
	p := autodj.NewPlayer(tracks, autodj.ModeSequential, 0, "/music/track2.mp3", nil)
	// NowPlaying is nil until Start() is called.
	assert.Nil(t, p.NowPlaying())
	got, _, _ := p.Tracks()
	require.Len(t, got, 4)
}

func TestNewPlayer_StartFromPath_NotFound(t *testing.T) {
	tracks := makeTracks(4)
	// Non-existent path → defaults to position 0, no panic.
	p := autodj.NewPlayer(tracks, autodj.ModeSequential, 0, "/music/nonexistent.mp3", nil)
	assert.Nil(t, p.NowPlaying())
}

// ── Tracks / SetTracks ────────────────────────────────────────────────────────

func TestTracks_ReturnsCopy(t *testing.T) {
	p := autodj.NewPlayer(makeTracks(3), autodj.ModeSequential, 0, "", nil)

	got, _, _ := p.Tracks()
	require.Len(t, got, 3)

	// Mutating the returned slice must not affect the player's internal list.
	saved := got[0]
	got[0] = nil

	got2, _, _ := p.Tracks()
	assert.Equal(t, saved, got2[0])
}

func TestSetTracks_ReplacesTrackList(t *testing.T) {
	p := autodj.NewPlayer(makeTracks(3), autodj.ModeSequential, 0, "", nil)
	p.SetTracks(makeTracks(5))

	got, _, _ := p.Tracks()
	assert.Len(t, got, 5)
}

func TestSetTracks_Empty(t *testing.T) {
	p := autodj.NewPlayer(makeTracks(3), autodj.ModeSequential, 0, "", nil)
	p.SetTracks(nil)

	got, _, _ := p.Tracks()
	assert.Empty(t, got)
}

// ── InsertNext / queue ────────────────────────────────────────────────────────

func TestInsertNext_AppearsInQueue(t *testing.T) {
	p := autodj.NewPlayer(makeTracks(3), autodj.ModeSequential, 0, "", nil)
	extra := &library.Track{ID: "extra", Path: "/music/extra.mp3", Title: "Extra"}
	p.InsertNext(extra)

	_, _, queue := p.Tracks()
	require.Len(t, queue, 1)
	assert.Equal(t, "extra", queue[0].ID)
}

func TestInsertNext_OrderPreserved(t *testing.T) {
	p := autodj.NewPlayer(makeTracks(3), autodj.ModeSequential, 0, "", nil)
	t1 := &library.Track{ID: "q1", Path: "/music/q1.mp3"}
	t2 := &library.Track{ID: "q2", Path: "/music/q2.mp3"}
	p.InsertNext(t1)
	p.InsertNext(t2)

	_, _, queue := p.Tracks()
	require.Len(t, queue, 2)
	assert.Equal(t, "q1", queue[0].ID)
	assert.Equal(t, "q2", queue[1].ID)
}

// ── JumpTo ────────────────────────────────────────────────────────────────────

func TestJumpTo_Valid(t *testing.T) {
	p := autodj.NewPlayer(makeTracks(5), autodj.ModeSequential, 0, "", nil)
	// Should not panic.
	p.JumpTo(3)
}

func TestJumpTo_OutOfBounds(t *testing.T) {
	p := autodj.NewPlayer(makeTracks(3), autodj.ModeSequential, 0, "", nil)
	// Out-of-range index must not panic.
	p.JumpTo(100)
	p.JumpTo(-1)
}

func TestJumpTo_ClearsQueue(t *testing.T) {
	p := autodj.NewPlayer(makeTracks(5), autodj.ModeSequential, 0, "", nil)
	p.InsertNext(&library.Track{ID: "q1"})
	p.InsertNext(&library.Track{ID: "q2"})
	p.JumpTo(2)

	_, _, queue := p.Tracks()
	assert.Empty(t, queue)
}

// ── Stop / Skip without Start ─────────────────────────────────────────────────

func TestStop_SafeBeforeStart(t *testing.T) {
	p := autodj.NewPlayer(makeTracks(3), autodj.ModeSequential, 0, "", nil)
	p.Stop()
	assert.False(t, p.IsRunning())
}

func TestSkip_SafeBeforeStart(t *testing.T) {
	p := autodj.NewPlayer(makeTracks(3), autodj.ModeSequential, 0, "", nil)
	// currentCmd is nil — must not panic.
	p.Skip()
}

// ── Mode ──────────────────────────────────────────────────────────────────────

func TestNewPlayer_ShuffleMode_TracksReordered(t *testing.T) {
	// With enough tracks, the shuffled order is almost certainly different from
	// sequential. We can't assert exact order, but we verify no panics and the
	// count is correct.
	p := autodj.NewPlayer(makeTracks(20), autodj.ModeShuffle, 0, "", nil)
	got, _, _ := p.Tracks()
	assert.Len(t, got, 20)
}
