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
func (s *Segmenter) MountDir(mountName string) string {
	safe := filepath.Base(filepath.Clean("/" + mountName))
	return filepath.Join(s.outputDir, safe)
}

// StartMount creates the output directory for a mount and returns the
// ffmpeg command that will write HLS segments from stdin.
//
// When llhls is true the segmenter uses fragmented MP4 output and the
// low_latency HLS flag so that partial segments (parts) are flushed to
// disk as they are encoded — required for LL-HLS blocking playlist reload.
//
// When rtpPort > 0 a second output is added: Opus RTP sent to
// 127.0.0.1:{rtpPort}, used by the WebRTC WHEP server. Pass 0 to
// disable the RTP output (e.g. when WebRTC is not configured).
//
// The caller is responsible for piping audio data into cmd.Stdin and
// for calling cmd.Wait() after the pipeline ends.
func (s *Segmenter) StartMount(ctx context.Context, mountName string, llhls bool, rtpPort int) (*exec.Cmd, error) {
	dir := s.MountDir(mountName)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, fmt.Errorf("hls: mkdir %q: %w", dir, err)
	}

	playlist := filepath.Join(dir, "index.m3u8")

	// Base args: input from stdin.
	args := []string{
		"-hide_banner",
		"-loglevel", "error",
		"-f", "aac",
		"-i", "pipe:0",
	}

	// HLS output (always present).
	if llhls {
		segPattern := filepath.Join(dir, "seg%05d.m4s")
		args = append(args,
			"-map", "0:a",
			"-c:a", "aac",
			"-b:a", "128k",
			"-ar", "44100",
			"-f", "hls",
			"-hls_time", strconv.Itoa(s.segmentDuration),
			"-hls_list_size", strconv.Itoa(s.playlistSize),
			"-hls_segment_type", "fmp4",
			"-hls_flags", "delete_segments+append_list",
			"-hls_fmp4_init_filename", "init.mp4",
			"-hls_segment_filename", segPattern,
			playlist,
		)
	} else {
		segPattern := filepath.Join(dir, "seg%05d.ts")
		args = append(args,
			"-map", "0:a",
			"-c:a", "aac",
			"-b:a", "128k",
			"-ar", "44100",
			"-f", "hls",
			"-hls_time", strconv.Itoa(s.segmentDuration),
			"-hls_list_size", strconv.Itoa(s.playlistSize),
			"-hls_flags", "delete_segments+append_list",
			"-hls_segment_filename", segPattern,
			playlist,
		)
	}

	// Optional WebRTC/WHEP RTP output (Opus, 48 kHz stereo, payload type 111).
	if rtpPort > 0 {
		rtpURL := fmt.Sprintf("rtp://127.0.0.1:%d", rtpPort)
		args = append(args,
			"-map", "0:a",
			"-c:a", "libopus",
			"-b:a", "96k",
			"-ar", "48000",
			"-ac", "2",
			"-application", "lowdelay",
			"-payload_type", "111",
			"-f", "rtp",
			rtpURL,
		)
	}

	// #nosec G204
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	cmd.Stderr = os.Stderr

	slog.Info("hls: starting segmenter", "mount", mountName, "ll_hls", llhls, "rtp_port", rtpPort, "dir", dir)
	return cmd, nil
}

// PlaylistPath returns the absolute path to the .m3u8 file for a mount.
func (s *Segmenter) PlaylistPath(mountName string) string {
	return filepath.Join(s.MountDir(mountName), "index.m3u8")
}
