// Package db manages the SQLite database connection and schema migrations.
package db

import (
	"database/sql"
	"fmt"
	"strings"

	_ "modernc.org/sqlite"
)

// Open opens (or creates) the SQLite database at path and runs all migrations.
func Open(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("db: open: %w", err)
	}
	db.SetMaxOpenConns(1) // SQLite is single-writer

	for _, pragma := range []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA foreign_keys=ON",
		"PRAGMA busy_timeout=5000",
	} {
		if _, err := db.Exec(pragma); err != nil {
			db.Close()
			return nil, fmt.Errorf("db: %s: %w", pragma, err)
		}
	}

	if err := migrate(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("db: migrate: %w", err)
	}
	return db, nil
}

func migrate(db *sql.DB) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id            TEXT PRIMARY KEY,
			username      TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			role          TEXT NOT NULL DEFAULT 'viewer',
			created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS mounts (
			id                   TEXT PRIMARY KEY,
			name                 TEXT UNIQUE NOT NULL,
			description          TEXT NOT NULL DEFAULT '',
			genre                TEXT NOT NULL DEFAULT '',
			website              TEXT NOT NULL DEFAULT '',
			source_password      TEXT NOT NULL DEFAULT '',
			protocol             TEXT NOT NULL DEFAULT 'HLS',
			codec                TEXT NOT NULL DEFAULT 'AAC',
			bitrate              TEXT NOT NULL DEFAULT '128k',
			created_at           TEXT NOT NULL,
			player_station_name  TEXT NOT NULL DEFAULT '',
			player_accent        TEXT NOT NULL DEFAULT '#E85D2F',
			player_accent_soft   TEXT NOT NULL DEFAULT 'rgba(232,93,47,0.16)',
			player_theme         TEXT NOT NULL DEFAULT 'dark',
			player_layout        TEXT NOT NULL DEFAULT 'split',
			player_ambient       INTEGER NOT NULL DEFAULT 1,
			player_show_about    INTEGER NOT NULL DEFAULT 1,
			player_show_history  INTEGER NOT NULL DEFAULT 1,
			player_show_playlist INTEGER NOT NULL DEFAULT 1,
			jingle_playlist_id   TEXT NOT NULL DEFAULT '',
			jingle_every_tracks  INTEGER NOT NULL DEFAULT 0,
			jingle_every_minutes INTEGER NOT NULL DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS playlists (
			id               TEXT PRIMARY KEY,
			name             TEXT NOT NULL,
			description      TEXT NOT NULL DEFAULT '',
			mode             TEXT NOT NULL DEFAULT 'sequential',
			crossfade_ms     INTEGER NOT NULL DEFAULT 0,
			track_paths      TEXT NOT NULL DEFAULT '[]',
			last_played_path TEXT NOT NULL DEFAULT '',
			created_at       TEXT NOT NULL,
			updated_at       TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS tracks (
			id           TEXT PRIMARY KEY,
			path         TEXT UNIQUE NOT NULL,
			title        TEXT NOT NULL DEFAULT '',
			artist       TEXT NOT NULL DEFAULT '',
			album        TEXT NOT NULL DEFAULT '',
			genre        TEXT NOT NULL DEFAULT '',
			duration_ms  INTEGER NOT NULL DEFAULT 0,
			bitrate_kbps INTEGER NOT NULL DEFAULT 0,
			size_bytes   INTEGER NOT NULL DEFAULT 0,
			folder       TEXT NOT NULL DEFAULT '',
			added_at     TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS autodj_sessions (
			mount        TEXT PRIMARY KEY,
			playlist_id  TEXT NOT NULL,
			mode         TEXT NOT NULL DEFAULT 'sequential'
		)`,
		`CREATE TABLE IF NOT EXISTS track_overrides (
			path   TEXT PRIMARY KEY,
			title  TEXT NOT NULL DEFAULT '',
			artist TEXT NOT NULL DEFAULT '',
			album  TEXT NOT NULL DEFAULT '',
			genre  TEXT NOT NULL DEFAULT ''
		)`,
		`CREATE TABLE IF NOT EXISTS webhooks (
			id         TEXT PRIMARY KEY,
			url        TEXT NOT NULL,
			events     TEXT NOT NULL DEFAULT '[]',
			secret     TEXT NOT NULL DEFAULT '',
			enabled    INTEGER NOT NULL DEFAULT 1,
			created_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS api_keys (
			id           TEXT PRIMARY KEY,
			name         TEXT NOT NULL,
			key_hash     TEXT NOT NULL,
			prefix       TEXT NOT NULL,
			created_at   TEXT NOT NULL,
			last_used_at TEXT,
			expires_at   TEXT,
			enabled      INTEGER NOT NULL DEFAULT 1,
			ip_allowlist TEXT NOT NULL DEFAULT '[]'
		)`,
		`CREATE TABLE IF NOT EXISTS schedules (
			id            TEXT PRIMARY KEY,
			name          TEXT NOT NULL,
			mount         TEXT NOT NULL,
			playlist_id   TEXT NOT NULL,
			days_mask     INTEGER NOT NULL,
			start_minutes INTEGER NOT NULL,
			end_minutes   INTEGER NOT NULL,
			enabled       INTEGER NOT NULL DEFAULT 1,
			created_at    TEXT NOT NULL
		)`,
	}
	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			return err
		}
	}

	// Idempotent column additions for upgrades from older schemas.
	// SQLite returns "duplicate column name" when the column already exists;
	// that's the steady-state and we ignore it.
	for _, alter := range []string{
		`ALTER TABLE mounts ADD COLUMN jingle_playlist_id   TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE mounts ADD COLUMN jingle_every_tracks  INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE mounts ADD COLUMN jingle_every_minutes INTEGER NOT NULL DEFAULT 0`,
	} {
		if _, err := db.Exec(alter); err != nil && !strings.Contains(err.Error(), "duplicate column name") {
			return fmt.Errorf("db: %s: %w", alter, err)
		}
	}
	return nil
}
