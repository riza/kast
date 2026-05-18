package db_test

import (
	"path/filepath"
	"testing"

	"github.com/riza/kast/internal/db"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOpen_InMemory(t *testing.T) {
	d, err := db.Open(":memory:")
	require.NoError(t, err)
	defer d.Close()
	require.NoError(t, d.Ping())
}

func TestOpen_AllTablesCreated(t *testing.T) {
	d, err := db.Open(":memory:")
	require.NoError(t, err)
	defer d.Close()

	for _, table := range []string{
		"users",
		"mounts",
		"playlists",
		"tracks",
		"autodj_sessions",
		"track_overrides",
	} {
		var name string
		err := d.QueryRow(
			"SELECT name FROM sqlite_master WHERE type='table' AND name=?", table,
		).Scan(&name)
		assert.NoError(t, err, "table %q should exist", table)
		assert.Equal(t, table, name)
	}
}

func TestOpen_ForeignKeysEnabled(t *testing.T) {
	d, err := db.Open(":memory:")
	require.NoError(t, err)
	defer d.Close()

	var fk int
	require.NoError(t, d.QueryRow("PRAGMA foreign_keys").Scan(&fk))
	assert.Equal(t, 1, fk)
}

func TestOpen_WALMode(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")
	d, err := db.Open(path)
	require.NoError(t, err)
	defer d.Close()

	var mode string
	require.NoError(t, d.QueryRow("PRAGMA journal_mode").Scan(&mode))
	assert.Equal(t, "wal", mode)
}

func TestOpen_FilePersists(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")

	d1, err := db.Open(path)
	require.NoError(t, err)
	_, err = d1.Exec("INSERT INTO users (id, username, password_hash, role) VALUES ('1', 'alice', 'hash', 'admin')")
	require.NoError(t, err)
	d1.Close()

	d2, err := db.Open(path)
	require.NoError(t, err)
	defer d2.Close()

	var username string
	require.NoError(t, d2.QueryRow("SELECT username FROM users WHERE id='1'").Scan(&username))
	assert.Equal(t, "alice", username)
}

func TestOpen_MigrationIdempotent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")

	d1, err := db.Open(path)
	require.NoError(t, err)
	d1.Close()

	// Opening again must not fail (CREATE TABLE IF NOT EXISTS).
	d2, err := db.Open(path)
	require.NoError(t, err)
	d2.Close()
}

func TestOpen_InvalidPath(t *testing.T) {
	_, err := db.Open("/nonexistent/dir/test.db")
	require.Error(t, err)
}
