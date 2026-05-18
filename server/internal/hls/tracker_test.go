// White-box tests: same package so we can test unexported handleFile, update, ready.
package hls

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func newTestTracker() *Tracker {
	tr := &Tracker{}
	tr.cond = sync.NewCond(&tr.mu)
	return tr
}

// ── update ───────────────────────────────────────────────────────────────────

func TestUpdate_Advances(t *testing.T) {
	tr := newTestTracker()
	tr.update(5, 3)
	assert.Equal(t, PartState{MSN: 5, Part: 3}, tr.current)
}

func TestUpdate_RejectsLowerMSN(t *testing.T) {
	tr := newTestTracker()
	tr.update(5, 3)
	tr.update(4, 10) // lower MSN — must be rejected
	assert.Equal(t, PartState{MSN: 5, Part: 3}, tr.current)
}

func TestUpdate_RejectsLowerPartSameMSN(t *testing.T) {
	tr := newTestTracker()
	tr.update(5, 3)
	tr.update(5, 2) // same MSN, lower part — must be rejected
	assert.Equal(t, PartState{MSN: 5, Part: 3}, tr.current)
}

func TestUpdate_RejectsSameState(t *testing.T) {
	tr := newTestTracker()
	tr.update(5, 3)
	tr.update(5, 3) // identical — no change, no spurious broadcast expected
	assert.Equal(t, PartState{MSN: 5, Part: 3}, tr.current)
}

func TestUpdate_AcceptsHigherPartSameMSN(t *testing.T) {
	tr := newTestTracker()
	tr.update(5, 3)
	tr.update(5, 4)
	assert.Equal(t, PartState{MSN: 5, Part: 4}, tr.current)
}

func TestUpdate_AcceptsHigherMSN(t *testing.T) {
	tr := newTestTracker()
	tr.update(5, 3)
	tr.update(6, 0)
	assert.Equal(t, PartState{MSN: 6, Part: 0}, tr.current)
}

func TestUpdate_ZeroPartCompletedSegment(t *testing.T) {
	tr := newTestTracker()
	tr.update(10, 5) // partial
	tr.update(10, 0) // Part=0 means "segment complete" — but 0 < 5, so rejected
	assert.Equal(t, PartState{MSN: 10, Part: 5}, tr.current)

	// Segment 11 completing (Part=0) with higher MSN must be accepted.
	tr.update(11, 0)
	assert.Equal(t, PartState{MSN: 11, Part: 0}, tr.current)
}

// ── ready ─────────────────────────────────────────────────────────────────────

func TestReady_ExactMatch(t *testing.T) {
	tr := &Tracker{current: PartState{MSN: 5, Part: 3}}
	assert.True(t, tr.ready(5, 3))
}

func TestReady_LowerPart(t *testing.T) {
	tr := &Tracker{current: PartState{MSN: 5, Part: 3}}
	assert.True(t, tr.ready(5, 2))
}

func TestReady_LowerMSN(t *testing.T) {
	tr := &Tracker{current: PartState{MSN: 5, Part: 3}}
	assert.True(t, tr.ready(4, 100))
}

func TestReady_HigherPart(t *testing.T) {
	tr := &Tracker{current: PartState{MSN: 5, Part: 3}}
	assert.False(t, tr.ready(5, 4))
}

func TestReady_HigherMSN(t *testing.T) {
	tr := &Tracker{current: PartState{MSN: 5, Part: 3}}
	assert.False(t, tr.ready(6, 0))
}

func TestReady_ZeroZero(t *testing.T) {
	tr := &Tracker{current: PartState{MSN: 0, Part: 0}}
	assert.True(t, tr.ready(0, 0))
}

// ── handleFile ────────────────────────────────────────────────────────────────

func TestHandleFile_PartFile(t *testing.T) {
	tr := newTestTracker()
	tr.handleFile("seg00042_003.m4s")
	assert.Equal(t, PartState{MSN: 42, Part: 3}, tr.current)
}

func TestHandleFile_PartFileLeadingZeros(t *testing.T) {
	tr := newTestTracker()
	tr.handleFile("seg00001_001.m4s")
	assert.Equal(t, PartState{MSN: 1, Part: 1}, tr.current)
}

func TestHandleFile_CompletedSegment(t *testing.T) {
	tr := newTestTracker()
	tr.handleFile("seg00042.m4s")
	assert.Equal(t, PartState{MSN: 42, Part: 0}, tr.current)
}

func TestHandleFile_Unknown(t *testing.T) {
	tr := newTestTracker()
	for _, name := range []string{
		"playlist.m3u8",
		"init.mp4",
		"index.html",
		"seg00042.ts",  // wrong extension
		"",
	} {
		tr.handleFile(name)
		assert.Equal(t, PartState{}, tr.current, "unexpected state change for file %q", name)
	}
}

func TestHandleFile_SequenceAdvances(t *testing.T) {
	tr := newTestTracker()
	tr.handleFile("seg00001_001.m4s")
	tr.handleFile("seg00001_002.m4s")
	tr.handleFile("seg00002_001.m4s")
	assert.Equal(t, PartState{MSN: 2, Part: 1}, tr.current)
}

// ── State ─────────────────────────────────────────────────────────────────────

func TestState_ReturnsCurrent(t *testing.T) {
	tr := newTestTracker()
	tr.current = PartState{MSN: 7, Part: 2}
	assert.Equal(t, PartState{MSN: 7, Part: 2}, tr.State())
}

func TestState_InitialIsZero(t *testing.T) {
	tr := newTestTracker()
	assert.Equal(t, PartState{}, tr.State())
}

// ── WaitFor ───────────────────────────────────────────────────────────────────

func TestWaitFor_AlreadyMet(t *testing.T) {
	tr := newTestTracker()
	tr.current = PartState{MSN: 10, Part: 5}

	done := make(chan PartState, 1)
	go func() { done <- tr.WaitFor(10, 5) }()

	select {
	case got := <-done:
		assert.Equal(t, PartState{MSN: 10, Part: 5}, got)
	case <-time.After(200 * time.Millisecond):
		t.Fatal("WaitFor should return immediately when condition is already met")
	}
}

func TestWaitFor_WaitsForUpdate(t *testing.T) {
	tr := newTestTracker()

	done := make(chan PartState, 1)
	go func() { done <- tr.WaitFor(1, 0) }()

	// Give goroutine time to enter the wait loop.
	time.Sleep(20 * time.Millisecond)
	tr.update(1, 0)

	select {
	case got := <-done:
		assert.Equal(t, PartState{MSN: 1, Part: 0}, got)
	case <-time.After(500 * time.Millisecond):
		t.Fatal("WaitFor did not unblock after update")
	}
}

func TestWaitFor_ReturnsCurrentState(t *testing.T) {
	tr := newTestTracker()

	done := make(chan PartState, 1)
	go func() { done <- tr.WaitFor(3, 2) }()

	time.Sleep(20 * time.Millisecond)
	// Advance past the requested point.
	tr.update(3, 5)

	select {
	case got := <-done:
		assert.Equal(t, PartState{MSN: 3, Part: 5}, got)
	case <-time.After(500 * time.Millisecond):
		t.Fatal("WaitFor did not return")
	}
}
