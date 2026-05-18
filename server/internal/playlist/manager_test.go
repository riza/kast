package playlist_test

import (
	"database/sql"
	"testing"

	"github.com/riza/kast/internal/db"
	"github.com/riza/kast/internal/playlist"
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

func newManager(t *testing.T) *playlist.Manager {
	t.Helper()
	m, err := playlist.NewManager(testDB(t))
	require.NoError(t, err)
	return m
}

func ptr[T any](v T) *T { return &v }

// ── Create ───────────────────────────────────────────────────────────────────

func TestCreate_Success(t *testing.T) {
	m := newManager(t)
	p, err := m.Create(playlist.CreateRequest{Name: "My Playlist"})
	require.NoError(t, err)
	assert.NotEmpty(t, p.ID)
	assert.Equal(t, "My Playlist", p.Name)
	assert.Equal(t, "sequential", p.Mode) // default
	assert.Empty(t, p.TrackPaths)
	assert.False(t, p.CreatedAt.IsZero())
	assert.False(t, p.UpdatedAt.IsZero())
}

func TestCreate_EmptyName(t *testing.T) {
	m := newManager(t)
	_, err := m.Create(playlist.CreateRequest{Name: ""})
	require.Error(t, err)
}

func TestCreate_ShuffleModeKept(t *testing.T) {
	m := newManager(t)
	p, err := m.Create(playlist.CreateRequest{Name: "Shuffled", Mode: "shuffle"})
	require.NoError(t, err)
	assert.Equal(t, "shuffle", p.Mode)
}

func TestCreate_InvalidModeDefaultsToSequential(t *testing.T) {
	m := newManager(t)
	p, err := m.Create(playlist.CreateRequest{Name: "Bad Mode", Mode: "random"})
	require.NoError(t, err)
	assert.Equal(t, "sequential", p.Mode)
}

func TestCreate_WithTracks(t *testing.T) {
	m := newManager(t)
	tracks := []string{"/music/a.mp3", "/music/b.mp3"}
	p, err := m.Create(playlist.CreateRequest{Name: "With Tracks", TrackPaths: tracks})
	require.NoError(t, err)
	assert.Equal(t, tracks, p.TrackPaths)
}

func TestCreate_WithCrossfade(t *testing.T) {
	m := newManager(t)
	p, err := m.Create(playlist.CreateRequest{Name: "Crossfade", CrossfadeMs: 2000})
	require.NoError(t, err)
	assert.Equal(t, 2000, p.CrossfadeMs)
}

// ── Get ──────────────────────────────────────────────────────────────────────

func TestGet_Success(t *testing.T) {
	m := newManager(t)
	created, err := m.Create(playlist.CreateRequest{Name: "Test"})
	require.NoError(t, err)

	got, err := m.Get(created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, got.ID)
	assert.Equal(t, "Test", got.Name)
}

func TestGet_NotFound(t *testing.T) {
	m := newManager(t)
	_, err := m.Get("nonexistent-id")
	require.ErrorIs(t, err, playlist.ErrNotFound)
}

func TestGet_ReturnsCopy(t *testing.T) {
	m := newManager(t)
	p, err := m.Create(playlist.CreateRequest{
		Name:       "Original",
		TrackPaths: []string{"/a.mp3"},
	})
	require.NoError(t, err)

	got, _ := m.Get(p.ID)
	got.TrackPaths[0] = "/mutated.mp3"

	// Mutation of returned copy must not affect stored playlist.
	got2, _ := m.Get(p.ID)
	assert.Equal(t, "/a.mp3", got2.TrackPaths[0])
}

// ── List ─────────────────────────────────────────────────────────────────────

func TestList_Empty(t *testing.T) {
	m := newManager(t)
	assert.Empty(t, m.List())
}

func TestList_Multiple(t *testing.T) {
	m := newManager(t)
	m.Create(playlist.CreateRequest{Name: "A"})
	m.Create(playlist.CreateRequest{Name: "B"})
	m.Create(playlist.CreateRequest{Name: "C"})
	assert.Len(t, m.List(), 3)
}

// ── Update ───────────────────────────────────────────────────────────────────

func TestUpdate_Name(t *testing.T) {
	m := newManager(t)
	p, err := m.Create(playlist.CreateRequest{Name: "Old"})
	require.NoError(t, err)

	updated, err := m.Update(p.ID, playlist.UpdateRequest{Name: ptr("New Name")})
	require.NoError(t, err)
	assert.Equal(t, "New Name", updated.Name)
}

func TestUpdate_EmptyName(t *testing.T) {
	m := newManager(t)
	p, err := m.Create(playlist.CreateRequest{Name: "Test"})
	require.NoError(t, err)

	_, err = m.Update(p.ID, playlist.UpdateRequest{Name: ptr("")})
	require.Error(t, err)
}

func TestUpdate_Mode(t *testing.T) {
	m := newManager(t)
	p, err := m.Create(playlist.CreateRequest{Name: "Test"})
	require.NoError(t, err)

	updated, err := m.Update(p.ID, playlist.UpdateRequest{Mode: ptr("shuffle")})
	require.NoError(t, err)
	assert.Equal(t, "shuffle", updated.Mode)
}

func TestUpdate_TrackPaths(t *testing.T) {
	m := newManager(t)
	p, err := m.Create(playlist.CreateRequest{Name: "Test"})
	require.NoError(t, err)

	tracks := []string{"/a.mp3", "/b.mp3"}
	updated, err := m.Update(p.ID, playlist.UpdateRequest{TrackPaths: tracks})
	require.NoError(t, err)
	assert.Equal(t, tracks, updated.TrackPaths)
}

func TestUpdate_CrossfadeMs(t *testing.T) {
	m := newManager(t)
	p, err := m.Create(playlist.CreateRequest{Name: "Test"})
	require.NoError(t, err)

	updated, err := m.Update(p.ID, playlist.UpdateRequest{CrossfadeMs: ptr(3000)})
	require.NoError(t, err)
	assert.Equal(t, 3000, updated.CrossfadeMs)
}

func TestUpdate_Partial(t *testing.T) {
	m := newManager(t)
	p, err := m.Create(playlist.CreateRequest{
		Name:        "Original",
		Description: "Desc",
		Mode:        "sequential",
	})
	require.NoError(t, err)

	// Only update description; other fields remain unchanged.
	updated, err := m.Update(p.ID, playlist.UpdateRequest{Description: ptr("New Desc")})
	require.NoError(t, err)
	assert.Equal(t, "Original", updated.Name)
	assert.Equal(t, "New Desc", updated.Description)
	assert.Equal(t, "sequential", updated.Mode)
}

func TestUpdate_AdvancesUpdatedAt(t *testing.T) {
	m := newManager(t)
	p, err := m.Create(playlist.CreateRequest{Name: "Test"})
	require.NoError(t, err)

	updated, err := m.Update(p.ID, playlist.UpdateRequest{Name: ptr("Updated")})
	require.NoError(t, err)
	assert.True(t, updated.UpdatedAt.Equal(p.UpdatedAt) || updated.UpdatedAt.After(p.UpdatedAt))
}

func TestUpdate_NotFound(t *testing.T) {
	m := newManager(t)
	_, err := m.Update("nonexistent-id", playlist.UpdateRequest{Name: ptr("X")})
	require.ErrorIs(t, err, playlist.ErrNotFound)
}

// ── SetLastPlayed ─────────────────────────────────────────────────────────────

func TestSetLastPlayed_Success(t *testing.T) {
	m := newManager(t)
	p, err := m.Create(playlist.CreateRequest{Name: "Test"})
	require.NoError(t, err)

	require.NoError(t, m.SetLastPlayed(p.ID, "/music/track.mp3"))

	got, _ := m.Get(p.ID)
	assert.Equal(t, "/music/track.mp3", got.LastPlayedPath)
}

func TestSetLastPlayed_NotFound(t *testing.T) {
	m := newManager(t)
	err := m.SetLastPlayed("nonexistent-id", "/music/track.mp3")
	require.ErrorIs(t, err, playlist.ErrNotFound)
}

// ── Delete ───────────────────────────────────────────────────────────────────

func TestDelete_Success(t *testing.T) {
	m := newManager(t)
	p, err := m.Create(playlist.CreateRequest{Name: "Test"})
	require.NoError(t, err)

	require.NoError(t, m.Delete(p.ID))
	assert.Empty(t, m.List())
}

func TestDelete_NotFound(t *testing.T) {
	m := newManager(t)
	err := m.Delete("nonexistent-id")
	require.ErrorIs(t, err, playlist.ErrNotFound)
}

// ── Persistence ───────────────────────────────────────────────────────────────

func TestPersistence_Reload(t *testing.T) {
	d := testDB(t)

	m1, err := playlist.NewManager(d)
	require.NoError(t, err)
	p, err := m1.Create(playlist.CreateRequest{
		Name:        "Persisted",
		Mode:        "shuffle",
		CrossfadeMs: 1500,
		TrackPaths:  []string{"/a.mp3", "/b.mp3"},
	})
	require.NoError(t, err)

	m2, err := playlist.NewManager(d)
	require.NoError(t, err)

	got, err := m2.Get(p.ID)
	require.NoError(t, err)
	assert.Equal(t, "Persisted", got.Name)
	assert.Equal(t, "shuffle", got.Mode)
	assert.Equal(t, 1500, got.CrossfadeMs)
	assert.Equal(t, []string{"/a.mp3", "/b.mp3"}, got.TrackPaths)
}

func TestPersistence_LastPlayed(t *testing.T) {
	d := testDB(t)

	m1, err := playlist.NewManager(d)
	require.NoError(t, err)
	p, err := m1.Create(playlist.CreateRequest{Name: "Test"})
	require.NoError(t, err)
	require.NoError(t, m1.SetLastPlayed(p.ID, "/music/last.mp3"))

	m2, err := playlist.NewManager(d)
	require.NoError(t, err)
	got, err := m2.Get(p.ID)
	require.NoError(t, err)
	assert.Equal(t, "/music/last.mp3", got.LastPlayedPath)
}
