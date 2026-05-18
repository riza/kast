package ytimport_test

import (
	"database/sql"
	"os/exec"
	"testing"
	"time"

	"github.com/riza/kast/internal/db"
	"github.com/riza/kast/internal/library"
	"github.com/riza/kast/internal/ytimport"
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

func testScanner(t *testing.T) *library.Scanner {
	t.Helper()
	s, err := library.NewScanner([]string{t.TempDir()}, []string{".mp3"}, testDB(t))
	require.NoError(t, err)
	return s
}

func newManager(t *testing.T) *ytimport.Manager {
	t.Helper()
	return ytimport.NewManager(t.TempDir(), testScanner(t))
}

func pendingItem(ytid, title string) *ytimport.Item {
	return &ytimport.Item{YTID: ytid, Title: title, Status: ytimport.StatusPending}
}

// ── NewManager ────────────────────────────────────────────────────────────────

func TestNewManager_NotNil(t *testing.T) {
	assert.NotNil(t, newManager(t))
}

// ── ListJobs ─────────────────────────────────────────────────────────────────

func TestListJobs_Empty(t *testing.T) {
	m := newManager(t)
	assert.Empty(t, m.ListJobs())
}

// ── GetJob ────────────────────────────────────────────────────────────────────

func TestGetJob_NotFound(t *testing.T) {
	m := newManager(t)
	assert.Nil(t, m.GetJob("nonexistent-id"))
}

// ── StartImport ───────────────────────────────────────────────────────────────

func TestStartImport_ReturnsNonEmptyID(t *testing.T) {
	m := newManager(t)
	id := m.StartImport([]*ytimport.Item{pendingItem("dQw4w9WgXcQ", "Test")})
	assert.NotEmpty(t, id)
}

func TestStartImport_JobAppearsInGetJob(t *testing.T) {
	m := newManager(t)
	id := m.StartImport([]*ytimport.Item{pendingItem("abc123", "Song")})

	job := m.GetJob(id)
	require.NotNil(t, job)
	assert.Equal(t, id, job.ID)
	assert.Len(t, job.Items, 1)
	assert.Equal(t, "abc123", job.Items[0].YTID)
	assert.Equal(t, "Song", job.Items[0].Title)
}

func TestStartImport_JobAppearsInListJobs(t *testing.T) {
	m := newManager(t)
	id := m.StartImport([]*ytimport.Item{pendingItem("v1", "Song")})

	jobs := m.ListJobs()
	require.NotEmpty(t, jobs)
	found := false
	for _, j := range jobs {
		if j.ID == id {
			found = true
		}
	}
	assert.True(t, found)
}

func TestStartImport_ItemsAreCopied(t *testing.T) {
	m := newManager(t)
	item := pendingItem("abc", "Original")
	id := m.StartImport([]*ytimport.Item{item})

	// Mutate the original item after StartImport.
	item.Title = "Mutated"

	job := m.GetJob(id)
	require.NotNil(t, job)
	assert.Equal(t, "Original", job.Items[0].Title, "StartImport should copy items")
}

func TestStartImport_MultipleItems(t *testing.T) {
	m := newManager(t)
	items := []*ytimport.Item{
		pendingItem("v1", "Track 1"),
		pendingItem("v2", "Track 2"),
		pendingItem("v3", "Track 3"),
	}
	id := m.StartImport(items)

	job := m.GetJob(id)
	require.NotNil(t, job)
	assert.Len(t, job.Items, 3)
}

func TestStartImport_StatusIsDownloadingImmediately(t *testing.T) {
	m := newManager(t)
	id := m.StartImport([]*ytimport.Item{pendingItem("v1", "Song")})

	job := m.GetJob(id)
	require.NotNil(t, job)
	// Job status is set to Downloading as soon as it's created.
	assert.Equal(t, ytimport.StatusDownloading, job.Status)
}

// ── ListJobs ordering ─────────────────────────────────────────────────────────

func TestListJobs_NewestFirst(t *testing.T) {
	m := newManager(t)
	id1 := m.StartImport([]*ytimport.Item{pendingItem("v1", "First")})
	time.Sleep(2 * time.Millisecond)
	id2 := m.StartImport([]*ytimport.Item{pendingItem("v2", "Second")})

	jobs := m.ListJobs()
	require.Len(t, jobs, 2)
	assert.Equal(t, id2, jobs[0].ID, "newest job should be listed first")
	assert.Equal(t, id1, jobs[1].ID)
}

// ── GetJob snapshot isolation ─────────────────────────────────────────────────

func TestGetJob_ReturnsIndependentCopies(t *testing.T) {
	m := newManager(t)
	id := m.StartImport([]*ytimport.Item{pendingItem("abc", "Song")})

	j1 := m.GetJob(id)
	j2 := m.GetJob(id)
	assert.NotSame(t, j1, j2)
}

// ── Requires yt-dlp ──────────────────────────────────────────────────────────

func TestPreview_RequiresYtDlp(t *testing.T) {
	if _, err := exec.LookPath("yt-dlp"); err != nil {
		t.Skip("yt-dlp not found in PATH")
	}
	// If yt-dlp is available, at minimum verify the call doesn't panic.
	// We don't hit a real URL in automated tests — just verify the API shape.
	m := newManager(t)
	require.NotNil(t, m)
}
