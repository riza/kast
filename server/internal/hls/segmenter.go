// Package hls manages HLS segment generation via ffmpeg.
package hls

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
)

// Segmenter transcodes an audio stream to HLS using ffmpeg.
type Segmenter struct {
	outputDir       string
	segmentDuration int
	playlistSize    int
}

// NewSegmenter creates a Segmenter that writes files to outputDir.
func NewSegmenter(outputDir string, segmentDuration, playlistSize int) (*Segmenter, error) {
	if err := os.MkdirAll(outputDir, 0o750); err != nil {
		return nil, fmt.Errorf("hls: mkdir %q: %w", outputDir, err)
	}
	return &Segmenter{
		outputDir:       outputDir,
		segmentDuration: segmentDuration,
		playlistSize:    playlistSize,
	}, nil
}

// MountDir returns the directory that holds HLS files for a named mount.
// The name is cleaned to prevent path traversal.
func (s *Segmenter) MountDir(mountName string) string {
	// Strip leading slash and clean; e.g. "/radio1" → "radio1"
	safe := filepath.Base(filepath.Clean("/" + mountName))
	return filepath.Join(s.outputDir, safe)
}

// StartMount creates the output directory for a mount and returns the
// ffmpeg command that will write HLS segments from stdin.
//
// The caller is responsible for piping audio data into cmd.Stdin and
// for calling cmd.Wait() after the pipeline ends.
//
// Security: all arguments are passed as a slice — no shell interpolation.
func (s *Segmenter) StartMount(ctx context.Context, mountName string) (*exec.Cmd, error) {
	dir := s.MountDir(mountName)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, fmt.Errorf("hls: mkdir %q: %w", dir, err)
	}

	playlist := filepath.Join(dir, "index.m3u8")
	segPattern := filepath.Join(dir, "seg%05d.ts")

	// #nosec G204 — all arguments are constructed from validated config values
	// and a sanitised mount name; no user input reaches the shell.
	cmd := exec.CommandContext(ctx,
		"ffmpeg",
		"-hide_banner",
		"-loglevel", "error",
		// Input: ADTS AAC stream from pipe
		"-f", "aac",
		"-i", "pipe:0",
		// Output codec
		"-c:a", "aac",
		"-b:a", "128k",
		"-ar", "44100",
		// HLS muxer options
		"-f", "hls",
		"-hls_time", strconv.Itoa(s.segmentDuration),
		"-hls_list_size", strconv.Itoa(s.playlistSize),
		"-hls_flags", "delete_segments+append_list",
		"-hls_segment_filename", segPattern,
		playlist,
	)
	cmd.Stderr = os.Stderr // ffmpeg errors visible in server log

	slog.Info("hls: starting segmenter", "mount", mountName, "dir", dir)
	return cmd, nil
}

// PlaylistPath returns the absolute path to the .m3u8 file for a mount.
func (s *Segmenter) PlaylistPath(mountName string) string {
	return filepath.Join(s.MountDir(mountName), "index.m3u8")
}
