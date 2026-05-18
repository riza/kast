package schedule_test

import (
	"database/sql"
	"testing"

	"github.com/riza/kast/internal/db"
	"github.com/riza/kast/internal/mount"
	"github.com/riza/kast/internal/playlist"
	"github.com/riza/kast/internal/schedule"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func testDB(t *testing.T) *sql.DB {
	t.Helper()
	d, err := db.Open(":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { d.Close() })
	return d
}

// fixtures seeds a fresh test bench: one playlist and one mount that schedules
// can validly reference.
func fixtures(t *testing.T) (*schedule.Manager, *mount.Manager, *playlist.Manager) {
	t.Helper()
	d := testDB(t)
	mm, err := mount.NewManager(d)
	require.NoError(t, err)
	_, err = mm.Create(mount.CreateRequest{Name: "/radio1", SourcePassword: "pw123456"})
	require.NoError(t, err)
	pm, err := playlist.NewManager(d)
	require.NoError(t, err)
	pl, err := pm.Create(playlist.CreateRequest{Name: "Morning Mix"})
	require.NoError(t, err)
	_ = pl
	sm, err := schedule.NewManager(d, mm, pm)
	require.NoError(t, err)
	return sm, mm, pm
}

// validReq builds a CreateRequest referencing the fixture mount and the given
// playlist, with sensible defaults the caller can override.
func validReq(pm *playlist.Manager) schedule.CreateRequest {
	pl := pm.List()[0]
	enabled := true
	return schedule.CreateRequest{
		Name:         "Morning",
		Mount:        "/radio1",
		PlaylistID:   pl.ID,
		DaysMask:     0b00111110, // Mon-Fri (bit 1=Mon … bit 5=Fri)
		StartMinutes: 6 * 60,
		EndMinutes:   10 * 60,
		Enabled:      &enabled,
	}
}

// ── Create ───────────────────────────────────────────────────────────────────

func TestCreate_Success(t *testing.T) {
	sm, _, pm := fixtures(t)
	s, err := sm.Create(validReq(pm))
	require.NoError(t, err)
	assert.NotEmpty(t, s.ID)
	assert.Equal(t, "Morning", s.Name)
	assert.Equal(t, "/radio1", s.Mount)
	assert.Equal(t, uint8(0b00111110), s.DaysMask)
	assert.Equal(t, 360, s.StartMinutes)
	assert.Equal(t, 600, s.EndMinutes)
	assert.True(t, s.Enabled)
	assert.False(t, s.CreatedAt.IsZero())
}

func TestCreate_DefaultEnabledIsTrue(t *testing.T) {
	sm, _, pm := fixtures(t)
	req := validReq(pm)
	req.Enabled = nil
	s, err := sm.Create(req)
	require.NoError(t, err)
	assert.True(t, s.Enabled)
}

func TestCreate_RejectsEmptyName(t *testing.T) {
	sm, _, pm := fixtures(t)
	req := validReq(pm)
	req.Name = ""
	_, err := sm.Create(req)
	require.Error(t, err)
}

func TestCreate_RejectsUnknownMount(t *testing.T) {
	sm, _, pm := fixtures(t)
	req := validReq(pm)
	req.Mount = "/nope"
	_, err := sm.Create(req)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "mount")
}

func TestCreate_RejectsUnknownPlaylist(t *testing.T) {
	sm, _, pm := fixtures(t)
	req := validReq(pm)
	req.PlaylistID = "missing"
	_, err := sm.Create(req)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "playlist")
}

func TestCreate_RejectsZeroDaysMask(t *testing.T) {
	sm, _, pm := fixtures(t)
	req := validReq(pm)
	req.DaysMask = 0
	_, err := sm.Create(req)
	require.Error(t, err)
}

func TestCreate_RejectsDaysMaskAboveSevenBits(t *testing.T) {
	sm, _, pm := fixtures(t)
	req := validReq(pm)
	req.DaysMask = 0xFF
	_, err := sm.Create(req)
	require.Error(t, err)
}

func TestCreate_RejectsEndNotAfterStart(t *testing.T) {
	sm, _, pm := fixtures(t)
	req := validReq(pm)
	req.StartMinutes = 600
	req.EndMinutes = 600
	_, err := sm.Create(req)
	require.Error(t, err)

	req.EndMinutes = 500
	_, err = sm.Create(req)
	require.Error(t, err)
}

func TestCreate_RejectsOutOfRangeMinutes(t *testing.T) {
	sm, _, pm := fixtures(t)
	req := validReq(pm)
	req.StartMinutes = -1
	_, err := sm.Create(req)
	require.Error(t, err)

	req = validReq(pm)
	req.EndMinutes = 1441
	_, err = sm.Create(req)
	require.Error(t, err)
}

// ── Overlap ──────────────────────────────────────────────────────────────────

func TestCreate_RejectsOverlapSameMountSameDay(t *testing.T) {
	sm, _, pm := fixtures(t)
	_, err := sm.Create(validReq(pm))
	require.NoError(t, err)

	// Same mount, overlapping window (08:00–11:00 over 06:00–10:00), Mon-Fri.
	req := validReq(pm)
	req.Name = "Overlap"
	req.StartMinutes = 8 * 60
	req.EndMinutes = 11 * 60
	_, err = sm.Create(req)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "overlap")
}

func TestCreate_AllowsAdjacentWindowsSameMount(t *testing.T) {
	sm, _, pm := fixtures(t)
	_, err := sm.Create(validReq(pm)) // 06:00–10:00
	require.NoError(t, err)

	// Touching at the boundary 10:00 is not an overlap (intervals are half-open).
	req := validReq(pm)
	req.Name = "Late morning"
	req.StartMinutes = 10 * 60
	req.EndMinutes = 12 * 60
	_, err = sm.Create(req)
	require.NoError(t, err)
}

func TestCreate_AllowsOverlapOnDifferentMounts(t *testing.T) {
	sm, mm, pm := fixtures(t)
	_, err := mm.Create(mount.CreateRequest{Name: "/radio2", SourcePassword: "pw123456"})
	require.NoError(t, err)

	_, err = sm.Create(validReq(pm))
	require.NoError(t, err)

	req := validReq(pm)
	req.Name = "On other mount"
	req.Mount = "/radio2"
	_, err = sm.Create(req)
	require.NoError(t, err)
}

func TestCreate_AllowsOverlapOnDisjointDays(t *testing.T) {
	sm, _, pm := fixtures(t)
	_, err := sm.Create(validReq(pm)) // Mon-Fri
	require.NoError(t, err)

	req := validReq(pm)
	req.Name = "Weekend mornings"
	req.DaysMask = 0b01000001 // Sat + Sun
	_, err = sm.Create(req)
	require.NoError(t, err)
}

func TestCreate_AllowsOverlapWithDisabledSchedule(t *testing.T) {
	sm, _, pm := fixtures(t)
	first, err := sm.Create(validReq(pm))
	require.NoError(t, err)

	// Disable the first one, then create an overlapping one.
	enabled := false
	_, err = sm.Update(first.ID, schedule.UpdateRequest{Enabled: &enabled})
	require.NoError(t, err)

	req := validReq(pm)
	req.Name = "Replacement"
	_, err = sm.Create(req)
	require.NoError(t, err)
}

// ── Update ───────────────────────────────────────────────────────────────────

func TestUpdate_MergesFields(t *testing.T) {
	sm, _, pm := fixtures(t)
	s, err := sm.Create(validReq(pm))
	require.NoError(t, err)

	newName := "Renamed"
	updated, err := sm.Update(s.ID, schedule.UpdateRequest{Name: &newName})
	require.NoError(t, err)
	assert.Equal(t, "Renamed", updated.Name)
	assert.Equal(t, s.Mount, updated.Mount)
	assert.Equal(t, s.StartMinutes, updated.StartMinutes)
}

func TestUpdate_RejectsOverlapAgainstOthers(t *testing.T) {
	sm, _, pm := fixtures(t)
	_, err := sm.Create(validReq(pm)) // 06:00–10:00
	require.NoError(t, err)

	other := validReq(pm)
	other.Name = "Afternoon"
	other.StartMinutes = 14 * 60
	other.EndMinutes = 18 * 60
	created, err := sm.Create(other)
	require.NoError(t, err)

	// Try to move "Afternoon" into the Morning window.
	newStart := 7 * 60
	_, err = sm.Update(created.ID, schedule.UpdateRequest{StartMinutes: &newStart})
	require.Error(t, err)
}

func TestUpdate_NotFound(t *testing.T) {
	sm, _, _ := fixtures(t)
	_, err := sm.Update("nope", schedule.UpdateRequest{})
	require.ErrorIs(t, err, schedule.ErrNotFound)
}

// ── Delete + persistence ─────────────────────────────────────────────────────

func TestDelete_RemovesAndPersists(t *testing.T) {
	sm, _, pm := fixtures(t)
	s, err := sm.Create(validReq(pm))
	require.NoError(t, err)

	require.NoError(t, sm.Delete(s.ID))
	_, err = sm.Get(s.ID)
	require.ErrorIs(t, err, schedule.ErrNotFound)
}

func TestLoad_FromDisk(t *testing.T) {
	d := testDB(t)
	mm, err := mount.NewManager(d)
	require.NoError(t, err)
	_, err = mm.Create(mount.CreateRequest{Name: "/radio1", SourcePassword: "pw123456"})
	require.NoError(t, err)
	pm, err := playlist.NewManager(d)
	require.NoError(t, err)
	pl, err := pm.Create(playlist.CreateRequest{Name: "Morning"})
	require.NoError(t, err)

	sm, err := schedule.NewManager(d, mm, pm)
	require.NoError(t, err)
	enabled := true
	_, err = sm.Create(schedule.CreateRequest{
		Name: "Morning", Mount: "/radio1", PlaylistID: pl.ID,
		DaysMask: 0b00111110, StartMinutes: 360, EndMinutes: 600, Enabled: &enabled,
	})
	require.NoError(t, err)

	// Rebuild from the same DB to confirm row scan works.
	sm2, err := schedule.NewManager(d, mm, pm)
	require.NoError(t, err)
	assert.Len(t, sm2.List(), 1)
}
