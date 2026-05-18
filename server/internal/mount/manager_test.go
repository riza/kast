package mount_test

import (
	"database/sql"
	"fmt"
	"testing"

	"github.com/riza/kast/internal/db"
	"github.com/riza/kast/internal/mount"
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

func newManager(t *testing.T) *mount.Manager {
	t.Helper()
	m, err := mount.NewManager(testDB(t))
	require.NoError(t, err)
	return m
}

var baseReq = mount.CreateRequest{
	Name:           "/mystream",
	SourcePassword: "password123",
}

// ── ValidCodec / ValidBitrate ────────────────────────────────────────────────

func TestValidCodec(t *testing.T) {
	for _, c := range []string{"AAC", "MP3", "OPUS"} {
		assert.True(t, mount.ValidCodec(c), "expected %q to be valid", c)
	}
	for _, c := range []string{"OGG", "aac", "mp3", "opus", "", "FLAC"} {
		assert.False(t, mount.ValidCodec(c), "expected %q to be invalid", c)
	}
}

func TestValidBitrate(t *testing.T) {
	for _, b := range []string{"64k", "128k", "192k", "320k", "1000k"} {
		assert.True(t, mount.ValidBitrate(b), "expected %q to be valid", b)
	}
	for _, b := range []string{"128", "k", "128K", "", "abc"} {
		assert.False(t, mount.ValidBitrate(b), "expected %q to be invalid", b)
	}
}

// ── Create ───────────────────────────────────────────────────────────────────

func TestCreate_Success(t *testing.T) {
	m := newManager(t)
	mt, err := m.Create(baseReq)
	require.NoError(t, err)
	assert.NotEmpty(t, mt.ID)
	assert.Equal(t, "/mystream", mt.Name)
	assert.Equal(t, mount.StatusIdle, mt.Status)
	assert.Equal(t, "AAC", mt.Codec)
	assert.Equal(t, "128k", mt.Bitrate)
	assert.Equal(t, "HLS", mt.Protocol)
	assert.False(t, mt.CreatedAt.IsZero())
}

func TestCreate_DefaultPlayerConfig(t *testing.T) {
	m := newManager(t)
	mt, err := m.Create(baseReq)
	require.NoError(t, err)
	assert.Equal(t, "#E85D2F", mt.PlayerAccent)
	assert.Equal(t, "dark", mt.PlayerTheme)
	assert.Equal(t, "split", mt.PlayerLayout)
	assert.True(t, mt.PlayerAmbient)
	assert.True(t, mt.PlayerShowAbout)
	assert.True(t, mt.PlayerShowHistory)
	assert.True(t, mt.PlayerShowPlaylist)
}

func TestCreate_InvalidName(t *testing.T) {
	m := newManager(t)
	for _, name := range []string{"noSlash", "/has space", "/UPPER", "", "/", "//double"} {
		req := baseReq
		req.Name = name
		_, err := m.Create(req)
		require.Error(t, err, "expected error for name %q", name)
	}
}

func TestCreate_ValidNames(t *testing.T) {
	m := newManager(t)
	for i, name := range []string{"/stream", "/my-stream", "/my_stream", "/stream123"} {
		req := mount.CreateRequest{Name: name, SourcePassword: fmt.Sprintf("password%d123", i)}
		_, err := m.Create(req)
		require.NoError(t, err, "name %q should be valid", name)
	}
}

func TestCreate_ShortPassword(t *testing.T) {
	m := newManager(t)
	req := baseReq
	req.SourcePassword = "short"
	_, err := m.Create(req)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "8 characters")
}

func TestCreate_Duplicate(t *testing.T) {
	m := newManager(t)
	_, err := m.Create(baseReq)
	require.NoError(t, err)
	_, err = m.Create(baseReq)
	require.ErrorIs(t, err, mount.ErrAlreadyExists)
}

func TestCreate_InvalidCodec(t *testing.T) {
	m := newManager(t)
	req := baseReq
	req.Codec = "OGG"
	_, err := m.Create(req)
	require.Error(t, err)
}

func TestCreate_InvalidBitrate(t *testing.T) {
	m := newManager(t)
	req := baseReq
	req.Bitrate = "128"
	_, err := m.Create(req)
	require.Error(t, err)
}

func TestCreate_ValidCodecs(t *testing.T) {
	m := newManager(t)
	for i, codec := range []string{"AAC", "MP3", "OPUS", "aac", "mp3", "opus"} {
		req := mount.CreateRequest{
			Name:           fmt.Sprintf("/stream%d", i),
			SourcePassword: "password123",
			Codec:          codec,
		}
		_, err := m.Create(req)
		require.NoError(t, err, "codec %q should be accepted", codec)
	}
}

func TestCreate_LLHLSProtocol(t *testing.T) {
	m := newManager(t)
	req := baseReq
	req.Protocol = "LL-HLS"
	mt, err := m.Create(req)
	require.NoError(t, err)
	assert.Equal(t, "LL-HLS", mt.Protocol)
}

func TestCreate_UnknownProtocolDefaultsToHLS(t *testing.T) {
	m := newManager(t)
	req := baseReq
	req.Protocol = "RTMP"
	mt, err := m.Create(req)
	require.NoError(t, err)
	assert.Equal(t, "HLS", mt.Protocol)
}

// ── Get / List ───────────────────────────────────────────────────────────────

func TestGet_Success(t *testing.T) {
	m := newManager(t)
	_, err := m.Create(baseReq)
	require.NoError(t, err)

	got, err := m.Get("/mystream")
	require.NoError(t, err)
	assert.Equal(t, "/mystream", got.Name)
}

func TestGet_NotFound(t *testing.T) {
	m := newManager(t)
	_, err := m.Get("/noexist")
	require.ErrorIs(t, err, mount.ErrNotFound)
}

func TestList_Empty(t *testing.T) {
	m := newManager(t)
	assert.Empty(t, m.List())
}

func TestList_Multiple(t *testing.T) {
	m := newManager(t)
	m.Create(mount.CreateRequest{Name: "/a", SourcePassword: "password123"})
	m.Create(mount.CreateRequest{Name: "/b", SourcePassword: "password456"})
	assert.Len(t, m.List(), 2)
}

// ── Delete ───────────────────────────────────────────────────────────────────

func TestDelete_Success(t *testing.T) {
	m := newManager(t)
	_, err := m.Create(baseReq)
	require.NoError(t, err)

	require.NoError(t, m.Delete("/mystream"))
	assert.Empty(t, m.List())
}

func TestDelete_NotFound(t *testing.T) {
	m := newManager(t)
	err := m.Delete("/noexist")
	require.ErrorIs(t, err, mount.ErrNotFound)
}

// ── SetStatus / SetListeners ─────────────────────────────────────────────────

func TestSetStatus(t *testing.T) {
	m := newManager(t)
	_, err := m.Create(baseReq)
	require.NoError(t, err)

	m.SetStatus("/mystream", mount.StatusLive)
	got, _ := m.Get("/mystream")
	assert.Equal(t, mount.StatusLive, got.Status)

	m.SetStatus("/mystream", mount.StatusError)
	got, _ = m.Get("/mystream")
	assert.Equal(t, mount.StatusError, got.Status)
}

func TestSetStatus_UnknownMount(t *testing.T) {
	m := newManager(t)
	// Should not panic on unknown mount name.
	m.SetStatus("/noexist", mount.StatusLive)
}

func TestSetListeners(t *testing.T) {
	m := newManager(t)
	_, err := m.Create(baseReq)
	require.NoError(t, err)

	m.SetListeners("/mystream", 42)
	got, _ := m.Get("/mystream")
	assert.Equal(t, 42, got.Listeners)
}

// ── UpdateMetadata ───────────────────────────────────────────────────────────

func TestUpdateMetadata_Success(t *testing.T) {
	m := newManager(t)
	_, err := m.Create(baseReq)
	require.NoError(t, err)

	err = m.UpdateMetadata("/mystream", mount.MetadataUpdate{
		Description: "My Stream",
		Genre:       "Electronic",
		Website:     "https://example.com",
		Codec:       "MP3",
		Bitrate:     "256k",
		Protocol:    "LL-HLS",
	})
	require.NoError(t, err)

	got, _ := m.Get("/mystream")
	assert.Equal(t, "My Stream", got.Description)
	assert.Equal(t, "Electronic", got.Genre)
	assert.Equal(t, "https://example.com", got.Website)
	assert.Equal(t, "MP3", got.Codec)
	assert.Equal(t, "256k", got.Bitrate)
	assert.Equal(t, "LL-HLS", got.Protocol)
}

func TestUpdateMetadata_InvalidCodec(t *testing.T) {
	m := newManager(t)
	_, err := m.Create(baseReq)
	require.NoError(t, err)

	err = m.UpdateMetadata("/mystream", mount.MetadataUpdate{Codec: "OGG"})
	require.Error(t, err)
}

func TestUpdateMetadata_InvalidBitrate(t *testing.T) {
	m := newManager(t)
	_, err := m.Create(baseReq)
	require.NoError(t, err)

	err = m.UpdateMetadata("/mystream", mount.MetadataUpdate{Bitrate: "128"})
	require.Error(t, err)
}

func TestUpdateMetadata_NotFound(t *testing.T) {
	m := newManager(t)
	err := m.UpdateMetadata("/noexist", mount.MetadataUpdate{Description: "x"})
	require.ErrorIs(t, err, mount.ErrNotFound)
}

// ── UpdatePlayerConfig ───────────────────────────────────────────────────────

func TestUpdatePlayerConfig_Success(t *testing.T) {
	m := newManager(t)
	_, err := m.Create(baseReq)
	require.NoError(t, err)

	err = m.UpdatePlayerConfig("/mystream", mount.PlayerConfigUpdate{
		StationName:  "Cool Radio",
		Accent:       "#FF0000",
		AccentSoft:   "rgba(255,0,0,0.1)",
		Theme:        "light",
		Layout:       "compact",
		Ambient:      false,
		ShowAbout:    false,
		ShowHistory:  true,
		ShowPlaylist: false,
	})
	require.NoError(t, err)

	got, _ := m.Get("/mystream")
	assert.Equal(t, "Cool Radio", got.PlayerStationName)
	assert.Equal(t, "#FF0000", got.PlayerAccent)
	assert.Equal(t, "light", got.PlayerTheme)
	assert.Equal(t, "compact", got.PlayerLayout)
	assert.False(t, got.PlayerAmbient)
	assert.False(t, got.PlayerShowAbout)
	assert.True(t, got.PlayerShowHistory)
	assert.False(t, got.PlayerShowPlaylist)
}

func TestUpdatePlayerConfig_NotFound(t *testing.T) {
	m := newManager(t)
	err := m.UpdatePlayerConfig("/noexist", mount.PlayerConfigUpdate{})
	require.ErrorIs(t, err, mount.ErrNotFound)
}

// ── VerifySourcePassword ─────────────────────────────────────────────────────

func TestVerifySourcePassword_Correct(t *testing.T) {
	m := newManager(t)
	_, err := m.Create(baseReq)
	require.NoError(t, err)
	assert.True(t, m.VerifySourcePassword("/mystream", "password123"))
}

func TestVerifySourcePassword_Wrong(t *testing.T) {
	m := newManager(t)
	_, err := m.Create(baseReq)
	require.NoError(t, err)
	assert.False(t, m.VerifySourcePassword("/mystream", "wrongpassword"))
}

func TestVerifySourcePassword_NotFound(t *testing.T) {
	m := newManager(t)
	assert.False(t, m.VerifySourcePassword("/noexist", "password123"))
}

// ── Persistence ──────────────────────────────────────────────────────────────

func TestPersistence_Reload(t *testing.T) {
	d := testDB(t)

	m1, err := mount.NewManager(d)
	require.NoError(t, err)
	_, err = m1.Create(baseReq)
	require.NoError(t, err)

	// Simulate restart: create new manager on same DB.
	m2, err := mount.NewManager(d)
	require.NoError(t, err)

	got, err := m2.Get("/mystream")
	require.NoError(t, err)
	assert.Equal(t, "/mystream", got.Name)
	assert.Equal(t, mount.StatusIdle, got.Status) // status resets to idle on load
}

func TestPersistence_PlayerConfig(t *testing.T) {
	d := testDB(t)

	m1, err := mount.NewManager(d)
	require.NoError(t, err)
	_, err = m1.Create(baseReq)
	require.NoError(t, err)
	err = m1.UpdatePlayerConfig("/mystream", mount.PlayerConfigUpdate{
		StationName: "Persisted Radio",
		Theme:       "light",
		Ambient:     false,
	})
	require.NoError(t, err)

	m2, err := mount.NewManager(d)
	require.NoError(t, err)
	got, err := m2.Get("/mystream")
	require.NoError(t, err)
	assert.Equal(t, "Persisted Radio", got.PlayerStationName)
	assert.Equal(t, "light", got.PlayerTheme)
	assert.False(t, got.PlayerAmbient)
}
