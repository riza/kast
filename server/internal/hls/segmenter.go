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
// codec must be one of AAC, MP3, OPUS. bitrate must be in NNNk format
// (e.g. "128k"). Both control the ffmpeg encoding pipeline.
//
// The caller is responsible for piping audio data into cmd.Stdin and
// for calling cmd.Wait() after the pipeline ends.
func (s *Segmenter) StartMount(ctx context.Context, mountName string, llhls bool, rtpPort int, codec string, bitrate string) (*exec.Cmd, error) {
	dir := s.MountDir(mountName)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, fmt.Errorf("hls: mkdir %q: %w", dir, err)
	}

	// Base args: input from stdin.
	args := []string{
		"-hide_banner",
		"-loglevel", "error",
		"-f", "aac",
		"-i", "pipe:0",
	}

	// HLS output (always present).
	args = append(args, hlsOutputArgs(dir, codec, bitrate, llhls, s.segmentDuration, s.playlistSize)...)

	// Optional WebRTC/WHEP RTP output (always Opus, 48 kHz stereo, payload type 111).
	if rtpPort > 0 {
		args = append(args, rtpOutputArgs(rtpPort, bitrate)...)
	}

	// #nosec G204
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	cmd.Stderr = os.Stderr

	slog.Info("hls: starting segmenter", "mount", mountName, "ll_hls", llhls, "rtp_port", rtpPort, "codec", codec, "bitrate", bitrate, "dir", dir)
	return cmd, nil
}

// hlsOutputArgs returns ffmpeg args for the HLS output, selecting the
// encoder and segment format based on the requested codec.
func hlsOutputArgs(dir, codec, bitrate string, llhls bool, segDuration, playlistSize int) []string {
	switch codec {
	case "MP3":
		return mp3HLSOutput(dir, bitrate, segDuration, playlistSize)
	case "OPUS":
		return opusHLSOutput(dir, bitrate, segDuration, playlistSize)
	default: // AAC
		return aacHLSOutput(dir, bitrate, llhls, segDuration, playlistSize)
	}
}

func aacHLSOutput(dir, bitrate string, llhls bool, segDuration, playlistSize int) []string {
	playlist := filepath.Join(dir, "index.m3u8")
	if llhls {
		segPattern := filepath.Join(dir, "seg%05d.m4s")
		return append([]string{
			"-map", "0:a",
			"-c:a", "aac",
			"-b:a", bitrate,
			"-ar", "44100",
			"-f", "hls",
			"-hls_time", strconv.Itoa(segDuration),
			"-hls_list_size", strconv.Itoa(playlistSize),
			"-hls_segment_type", "fmp4",
			"-hls_flags", "delete_segments+append_list",
			"-hls_fmp4_init_filename", "init.mp4",
			"-hls_segment_filename", segPattern,
		}, playlist)
	}
	segPattern := filepath.Join(dir, "seg%05d.ts")
	return append([]string{
		"-map", "0:a",
		"-c:a", "aac",
		"-b:a", bitrate,
		"-ar", "44100",
		"-f", "hls",
		"-hls_time", strconv.Itoa(segDuration),
		"-hls_list_size", strconv.Itoa(playlistSize),
		"-hls_flags", "delete_segments+append_list",
		"-hls_segment_filename", segPattern,
	}, playlist)
}

func mp3HLSOutput(dir, bitrate string, segDuration, playlistSize int) []string {
	playlist := filepath.Join(dir, "index.m3u8")
	segPattern := filepath.Join(dir, "seg%05d.ts") // MP3 requires MPEG-TS; fMP4 containers reject it
	return append([]string{
		"-map", "0:a",
		"-c:a", "libmp3lame",
		"-b:a", bitrate,
		"-ar", "44100",
		"-f", "hls",
		"-hls_time", strconv.Itoa(segDuration),
		"-hls_list_size", strconv.Itoa(playlistSize),
		"-hls_flags", "delete_segments+append_list",
		"-hls_segment_filename", segPattern,
	}, playlist)
}

func opusHLSOutput(dir, bitrate string, segDuration, playlistSize int) []string {
	playlist := filepath.Join(dir, "index.m3u8")
	segPattern := filepath.Join(dir, "seg%05d.m4s")
	return append([]string{
		"-map", "0:a",
		"-c:a", "libopus",
		"-b:a", bitrate,
		"-ar", "48000",
		"-f", "hls",
		"-hls_time", strconv.Itoa(segDuration),
		"-hls_list_size", strconv.Itoa(playlistSize),
		"-hls_segment_type", "fmp4",
		"-hls_flags", "delete_segments+append_list",
		"-hls_fmp4_init_filename", "init.mp4",
		"-hls_segment_filename", segPattern,
	}, playlist)
}

// rtpOutputArgs returns ffmpeg args for the optional RTP output.
// WebRTC requires Opus, so the codec is always libopus regardless of
// the mount's HLS codec. The bitrate is taken from the mount config.
func rtpOutputArgs(rtpPort int, bitrate string) []string {
	rtpURL := fmt.Sprintf("rtp://127.0.0.1:%d", rtpPort)
	return []string{
		"-map", "0:a",
		"-c:a", "libopus",
		"-b:a", bitrate,
		"-ar", "48000",
		"-ac", "2",
		"-application", "lowdelay",
		"-payload_type", "111",
		"-f", "rtp",
		rtpURL,
	}
}

// PlaylistPath returns the absolute path to the .m3u8 file for a mount.
func (s *Segmenter) PlaylistPath(mountName string) string {
	return filepath.Join(s.MountDir(mountName), "index.m3u8")
}
