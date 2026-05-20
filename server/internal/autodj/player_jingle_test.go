package autodj

import (
	"fmt"
	"testing"
	"time"

	"github.com/riza/kast/internal/library"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Tests live in the same package so they can drive the unexported nextTrack()
// directly without spinning up ffmpeg.

func mkTracks(prefix string, n int) []*library.Track {
	out := make([]*library.Track, n)
	for i := range out {
		out[i] = &library.Track{
			ID:    fmt.Sprintf("%s-%d", prefix, i+1),
			Path:  fmt.Sprintf("/m/%s%d.mp3", prefix, i+1),
			Title: fmt.Sprintf("%s %d", prefix, i+1),
		}
	}
	return out
}

func drainSequence(t *testing.T, p *Player, n int) []string {
	t.Helper()
	ids := make([]string, 0, n)
	for i := 0; i < n; i++ {
		track, isJingle := p.nextTrack()
		require.NotNil(t, track, "nextTrack returned nil at step %d", i)
		tag := track.ID
		if isJingle {
			tag = "J:" + tag
		}
		ids = append(ids, tag)
	}
	return ids
}

func TestJingle_Disabled_NoInsertion(t *testing.T) {
	p := NewPlayer(mkTracks("m", 3), ModeSequential, 0, "", nil)
	// No SetJingles call → no jingles.
	got := drainSequence(t, p, 6)
	assert.Equal(t, []string{"m-1", "m-2", "m-3", "m-1", "m-2", "m-3"}, got)
}

func TestJingle_EmptyPool_NoInsertion(t *testing.T) {
	p := NewPlayer(mkTracks("m", 3), ModeSequential, 0, "", nil)
	p.SetJingles(JingleConfig{Tracks: nil, EveryTracks: 1}, nil)
	got := drainSequence(t, p, 4)
	assert.Equal(t, []string{"m-1", "m-2", "m-3", "m-1"}, got)
}

func TestJingle_EveryNTracks_Pattern(t *testing.T) {
	// 3 music tracks, 1 jingle, every 2 music tracks.
	// Pattern expected: M M J M M J M M J ...
	p := NewPlayer(mkTracks("m", 3), ModeSequential, 0, "", nil)
	p.SetJingles(JingleConfig{Tracks: mkTracks("j", 1), EveryTracks: 2}, nil)

	got := drainSequence(t, p, 10)
	assert.Equal(t, []string{
		"m-1", "m-2", "J:j-1",
		"m-3", "m-1", "J:j-1",
		"m-2", "m-3", "J:j-1",
		"m-1",
	}, got)
}

func TestJingle_RotatesThroughPool(t *testing.T) {
	// 2 music tracks, 2 jingles, every 1 music track.
	// Pool of size 2 → jingleNext rotates; jingle is one of j-1, j-2 each time
	// and the two should alternate (not back-to-back duplicates).
	p := NewPlayer(mkTracks("m", 2), ModeSequential, 0, "", nil)
	jingles := mkTracks("j", 2)
	p.SetJingles(JingleConfig{Tracks: jingles, EveryTracks: 1}, nil)
	// Pin the starting offset for deterministic order.
	p.jingleNext = 0

	got := drainSequence(t, p, 6)
	// Music, jingle, music, jingle, music, jingle.
	require.Len(t, got, 6)
	assert.Equal(t, "m-1", got[0])
	assert.Equal(t, "J:j-1", got[1])
	assert.Equal(t, "m-2", got[2])
	assert.Equal(t, "J:j-2", got[3])
	assert.Equal(t, "m-1", got[4])
	assert.Equal(t, "J:j-1", got[5])
}

func TestJingle_EveryMinutes_FiresOnTimer(t *testing.T) {
	p := NewPlayer(mkTracks("m", 3), ModeSequential, 0, "", nil)
	p.SetJingles(JingleConfig{Tracks: mkTracks("j", 1), EveryMinutes: 1}, nil)

	// Until the timer trips, only music plays.
	t1, j1 := p.nextTrack()
	assert.Equal(t, "m-1", t1.ID)
	assert.False(t, j1)

	// Simulate ≥1 minute elapsed since the timer started.
	p.mu.Lock()
	p.lastJingleAt = time.Now().Add(-2 * time.Minute)
	p.mu.Unlock()

	t2, j2 := p.nextTrack()
	assert.Equal(t, "j-1", t2.ID)
	assert.True(t, j2, "jingle should fire after minute elapsed")

	// Right after firing, counters reset → next call is music again.
	t3, j3 := p.nextTrack()
	assert.Equal(t, "m-2", t3.ID)
	assert.False(t, j3)
}

func TestJingle_BothCadences_WhicheverFirst(t *testing.T) {
	// every 4 tracks OR every 1 minute. Trigger the timer first.
	p := NewPlayer(mkTracks("m", 10), ModeSequential, 0, "", nil)
	p.SetJingles(JingleConfig{
		Tracks:       mkTracks("j", 1),
		EveryTracks:  4,
		EveryMinutes: 1,
	}, nil)

	// Play 2 music tracks (well under the 4-track threshold).
	_, _ = p.nextTrack()
	_, _ = p.nextTrack()

	// Force timer to have elapsed.
	p.mu.Lock()
	p.lastJingleAt = time.Now().Add(-90 * time.Second)
	p.mu.Unlock()

	track, isJingle := p.nextTrack()
	assert.True(t, isJingle, "minute-cadence should fire even though track count < EveryTracks")
	assert.Equal(t, "j-1", track.ID)
}

func TestJingle_QueueDrainCountsTowardCadence(t *testing.T) {
	// Manually queued tracks count as songs for the every-N-tracks counter.
	p := NewPlayer(mkTracks("m", 5), ModeSequential, 0, "", nil)
	p.SetJingles(JingleConfig{Tracks: mkTracks("j", 1), EveryTracks: 2}, nil)

	extra := &library.Track{ID: "x-1", Path: "/m/x.mp3", Title: "Extra"}
	p.InsertNext(extra)

	got := drainSequence(t, p, 4)
	// Step 1: queue → x-1 (counts as 1)
	// Step 2: main → m-1 (counts as 2, threshold reached)
	// Step 3: jingle → J:j-1
	// Step 4: main → m-2
	assert.Equal(t, []string{"x-1", "m-1", "J:j-1", "m-2"}, got)
}

func TestJingle_DisableViaEmptyConfig(t *testing.T) {
	p := NewPlayer(mkTracks("m", 2), ModeSequential, 0, "", nil)
	p.SetJingles(JingleConfig{Tracks: mkTracks("j", 1), EveryTracks: 1}, nil)
	// Confirm a jingle fires.
	_, _ = p.nextTrack()
	_, isJ := p.nextTrack()
	require.True(t, isJ)

	// Disable.
	p.SetJingles(JingleConfig{}, nil)
	for i := 0; i < 5; i++ {
		_, isJ := p.nextTrack()
		assert.False(t, isJ, "no jingles should fire after disable")
	}
}

func TestJingleConfig_Enabled(t *testing.T) {
	assert.False(t, JingleConfig{}.Enabled())
	assert.False(t, JingleConfig{Tracks: mkTracks("j", 1)}.Enabled(), "needs an interval")
	assert.False(t, JingleConfig{EveryTracks: 3}.Enabled(), "needs tracks")
	assert.True(t, JingleConfig{Tracks: mkTracks("j", 1), EveryTracks: 3}.Enabled())
	assert.True(t, JingleConfig{Tracks: mkTracks("j", 1), EveryMinutes: 5}.Enabled())
}

func TestJingle_OnJingleStartCallback(t *testing.T) {
	p := NewPlayer(mkTracks("m", 2), ModeSequential, 0, "", nil)

	var jingleHits []string
	p.SetJingles(JingleConfig{Tracks: mkTracks("j", 1), EveryTracks: 1}, func(tr *library.Track) {
		jingleHits = append(jingleHits, tr.ID)
	})

	// Drive the loop's behaviour manually: nextTrack + manual onJingleStart invoke.
	// (loop() is the producer of the callback; we simulate it here.)
	for i := 0; i < 4; i++ {
		track, isJingle := p.nextTrack()
		require.NotNil(t, track)
		if isJingle && p.onJingleStart != nil {
			p.onJingleStart(track)
		}
	}
	// Pattern M J M J → two jingles seen.
	assert.Equal(t, []string{"j-1", "j-1"}, jingleHits)
}
