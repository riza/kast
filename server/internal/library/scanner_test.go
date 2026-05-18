package library_test

import (
	"context"
	"database/sql"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/riza/kast/internal/db"
	"github.com/riza/kast/internal/library"
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

// ── NewScanner ────────────────────────────────────────────────────────────────

func TestNewScanner_Empty(t *testing.T) {
	s, err := library.NewScanner([]string{t.TempDir()}, []string{".mp3"}, testDB(t))
	require.NoError(t, err)
	assert.Empty(t, s.Tracks())
}

// ── PrimaryUploadDir ──────────────────────────────────────────────────────────

func TestPrimaryUploadDir_ReturnsFirst(t *testing.T) {
	dir := t.TempDir()
	s, err := library.NewScanner([]string{dir, "/other"}, []string{".mp3"}, testDB(t))
	require.NoError(t, err)
	assert.Equal(t, dir, s.PrimaryUploadDir())
}

func TestPrimaryUploadDir_DefaultFallback(t *testing.T) {
	s, err := library.NewScanner(nil, nil, testDB(t))
	require.NoError(t, err)
	assert.Equal(t, "./data/music", s.PrimaryUploadDir())
}

// ── Scan ──────────────────────────────────────────────────────────────────────

func TestScan_EmptyDir(t *testing.T) {
	s, err := library.NewScanner([]string{t.TempDir()}, []string{".mp3"}, testDB(t))
	require.NoError(t, err)
	require.NoError(t, s.Scan(context.Background()))
	assert.Empty(t, s.Tracks())
}

func TestScan_SkipsNonAudioFiles(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "README.txt"), []byte("hello"), 0o600))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "cover.jpg"), []byte("img"), 0o600))

	s, err := library.NewScanner([]string{dir}, []string{".mp3", ".flac"}, testDB(t))
	require.NoError(t, err)
	require.NoError(t, s.Scan(context.Background()))
	assert.Empty(t, s.Tracks())
}

func TestScan_ContextCancelled(t *testing.T) {
	dir := t.TempDir()
	s, err := library.NewScanner([]string{dir}, []string{".mp3"}, testDB(t))
	require.NoError(t, err)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	// Scan should return an error (or nil if dir was empty); must not block.
	_ = s.Scan(ctx)
}

// ── UpdateTrack ───────────────────────────────────────────────────────────────

func TestUpdateTrack_NotFound(t *testing.T) {
	s, err := library.NewScanner([]string{t.TempDir()}, []string{".mp3"}, testDB(t))
	require.NoError(t, err)

	_, err = s.UpdateTrack("nonexistent-id", "Title", "Artist", "Album", "Genre")
	require.Error(t, err)
}

// ── Tests requiring ffmpeg + ffprobe ─────────────────────────────────────────

func requireAudioTools(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not found in PATH")
	}
	if _, err := exec.LookPath("ffprobe"); err != nil {
		t.Skip("ffprobe not found in PATH")
	}
}

func generateTestTone(t *testing.T, path string) {
	t.Helper()
	cmd := exec.Command("ffmpeg",
		"-f", "lavfi",
		"-i", "sine=frequency=440:duration=1",
		"-c:a", "libmp3lame",
		"-q:a", "9",
		"-y", path,
	)
	out, err := cmd.CombinedOutput()
	require.NoError(t, err, "ffmpeg generate tone: %s", out)
}

func TestScan_WithFFProbe_FindsTrack(t *testing.T) {
	requireAudioTools(t)

	dir := t.TempDir()
	generateTestTone(t, filepath.Join(dir, "tone.mp3"))

	d := testDB(t)
	s, err := library.NewScanner([]string{dir}, []string{".mp3"}, d)
	require.NoError(t, err)
	require.NoError(t, s.Scan(context.Background()))

	tracks := s.Tracks()
	require.Len(t, tracks, 1)
	assert.Equal(t, filepath.Join(dir, "tone.mp3"), tracks[0].Path)
	assert.Equal(t, "tone", tracks[0].Title) // derived from filename
	assert.Greater(t, tracks[0].DurationMs, int64(0))
	assert.Greater(t, tracks[0].SizeBytes, int64(0))
	assert.NotEmpty(t, tracks[0].ID)
	assert.False(t, tracks[0].AddedAt.IsZero())
}

func TestScan_WithFFProbe_PersistsToDB(t *testing.T) {
	requireAudioTools(t)

	dir := t.TempDir()
	generateTestTone(t, filepath.Join(dir, "tone.mp3"))

	d := testDB(t)
	s1, err := library.NewScanner([]string{dir}, []string{".mp3"}, d)
	require.NoError(t, err)
	require.NoError(t, s1.Scan(context.Background()))

	// Reload scanner from same DB — tracks should be present without re-scanning.
	s2, err := library.NewScanner([]string{dir}, []string{".mp3"}, d)
	require.NoError(t, err)
	require.Len(t, s2.Tracks(), 1)
}

func TestUpdateTrack_WithFFProbe(t *testing.T) {
	requireAudioTools(t)

	dir := t.TempDir()
	generateTestTone(t, filepath.Join(dir, "tone.mp3"))

	d := testDB(t)
	s, err := library.NewScanner([]string{dir}, []string{".mp3"}, d)
	require.NoError(t, err)
	require.NoError(t, s.Scan(context.Background()))

	tracks := s.Tracks()
	require.Len(t, tracks, 1)

	updated, err := s.UpdateTrack(tracks[0].ID, "Custom Title", "Custom Artist", "My Album", "Rock")
	require.NoError(t, err)
	assert.Equal(t, "Custom Title", updated.Title)
	assert.Equal(t, "Custom Artist", updated.Artist)
	assert.Equal(t, "My Album", updated.Album)
	assert.Equal(t, "Rock", updated.Genre)

	// In-memory list should reflect the update immediately.
	all := s.Tracks()
	assert.Equal(t, "Custom Title", all[0].Title)
	assert.Equal(t, "Custom Artist", all[0].Artist)
}

func TestUpdateTrack_OverrideSurvivesRescan(t *testing.T) {
	requireAudioTools(t)

	dir := t.TempDir()
	generateTestTone(t, filepath.Join(dir, "tone.mp3"))

	d := testDB(t)
	s, err := library.NewScanner([]string{dir}, []string{".mp3"}, d)
	require.NoError(t, err)
	require.NoError(t, s.Scan(context.Background()))

	tracks := s.Tracks()
	_, err = s.UpdateTrack(tracks[0].ID, "Override Title", "Override Artist", "", "")
	require.NoError(t, err)

	// Re-scan — override should be preserved.
	require.NoError(t, s.Scan(context.Background()))
	all := s.Tracks()
	require.Len(t, all, 1)
	assert.Equal(t, "Override Title", all[0].Title)
	assert.Equal(t, "Override Artist", all[0].Artist)
}

func TestScan_WithFFProbe_MultipleFiles(t *testing.T) {
	requireAudioTools(t)

	dir := t.TempDir()
	generateTestTone(t, filepath.Join(dir, "a.mp3"))
	generateTestTone(t, filepath.Join(dir, "b.mp3"))
	generateTestTone(t, filepath.Join(dir, "c.mp3"))

	s, err := library.NewScanner([]string{dir}, []string{".mp3"}, testDB(t))
	require.NoError(t, err)
	require.NoError(t, s.Scan(context.Background()))
	assert.Len(t, s.Tracks(), 3)
}
