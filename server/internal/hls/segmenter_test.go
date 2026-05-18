package hls_test

import (
	"context"
	"strings"
	"testing"

	"github.com/riza/kast/internal/hls"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewSegmenter_CreatesOutputDir(t *testing.T) {
	dir := t.TempDir()
	s, err := hls.NewSegmenter(dir, 6, 5)
	require.NoError(t, err)
	assert.NotNil(t, s)
}

func TestNewSegmenter_InvalidDir(t *testing.T) {
	// A path with a null byte is always invalid on POSIX.
	_, err := hls.NewSegmenter("/tmp/kast\x00test", 6, 5)
	require.Error(t, err)
}

// ── MountDir ──────────────────────────────────────────────────────────────────

func TestMountDir_IncludesMountName(t *testing.T) {
	s, err := hls.NewSegmenter(t.TempDir(), 6, 5)
	require.NoError(t, err)
	dir := s.MountDir("/mystream")
	assert.Contains(t, dir, "mystream")
}

func TestMountDir_PathTraversalSafe(t *testing.T) {
	baseDir := t.TempDir()
	s, err := hls.NewSegmenter(baseDir, 6, 5)
	require.NoError(t, err)

	// A traversal attempt must not escape the base directory.
	dir := s.MountDir("/../../etc/passwd")
	assert.True(t, strings.HasPrefix(dir, baseDir), "MountDir should stay under output dir")
	assert.NotContains(t, dir, "etc")
}

func TestMountDir_DifferentMounts(t *testing.T) {
	s, err := hls.NewSegmenter(t.TempDir(), 6, 5)
	require.NoError(t, err)
	assert.NotEqual(t, s.MountDir("/radio1"), s.MountDir("/radio2"))
}

// ── PlaylistPath ──────────────────────────────────────────────────────────────

func TestPlaylistPath_EndsWithM3U8(t *testing.T) {
	s, err := hls.NewSegmenter(t.TempDir(), 6, 5)
	require.NoError(t, err)
	assert.True(t, strings.HasSuffix(s.PlaylistPath("/mystream"), "index.m3u8"))
}

func TestPlaylistPath_UnderMountDir(t *testing.T) {
	s, err := hls.NewSegmenter(t.TempDir(), 6, 5)
	require.NoError(t, err)
	assert.True(t, strings.HasPrefix(s.PlaylistPath("/mystream"), s.MountDir("/mystream")))
}

// ── StartMount — arg inspection (no ffmpeg execution) ────────────────────────

func buildCmd(t *testing.T, mountName string, llhls bool, rtpPort int, codec, bitrate string) []string {
	t.Helper()
	s, err := hls.NewSegmenter(t.TempDir(), 6, 5)
	require.NoError(t, err)
	cmd, err := s.StartMount(context.Background(), mountName, llhls, rtpPort, codec, bitrate)
	require.NoError(t, err)
	require.NotNil(t, cmd)
	return cmd.Args
}

func containsArg(args []string, s string) bool {
	for _, a := range args {
		if strings.Contains(a, s) {
			return true
		}
	}
	return false
}

func TestStartMount_CreatesDir(t *testing.T) {
	base := t.TempDir()
	s, err := hls.NewSegmenter(base, 6, 5)
	require.NoError(t, err)

	_, err = s.StartMount(context.Background(), "/mystream", false, 0, "AAC", "128k")
	require.NoError(t, err)
	assert.DirExists(t, s.MountDir("/mystream"))
}

func TestStartMount_AAC_HasAACEncoder(t *testing.T) {
	args := buildCmd(t, "/radio", false, 0, "AAC", "128k")
	assert.True(t, containsArg(args, "aac"), "AAC codec arg missing")
}

func TestStartMount_MP3_HasMP3Encoder(t *testing.T) {
	args := buildCmd(t, "/radio", false, 0, "MP3", "192k")
	assert.True(t, containsArg(args, "libmp3lame"), "libmp3lame arg missing")
}

func TestStartMount_OPUS_HasOpusEncoder(t *testing.T) {
	args := buildCmd(t, "/radio", false, 0, "OPUS", "128k")
	assert.True(t, containsArg(args, "libopus"), "libopus arg missing")
}

func TestStartMount_Bitrate_AppearsInArgs(t *testing.T) {
	args := buildCmd(t, "/radio", false, 0, "AAC", "256k")
	assert.True(t, containsArg(args, "256k"), "bitrate 256k not found in args")
}

func TestStartMount_LLHLS_UsesFMP4(t *testing.T) {
	args := buildCmd(t, "/radio", true, 0, "AAC", "128k")
	assert.True(t, containsArg(args, "fmp4"), "fmp4 segment type not found for LL-HLS")
}

func TestStartMount_HLS_UsesTSFormat(t *testing.T) {
	args := buildCmd(t, "/radio", false, 0, "AAC", "128k")
	// Standard HLS uses .ts segments; LL-HLS uses fmp4.
	assert.False(t, containsArg(args, "fmp4"), "fmp4 should not appear for standard HLS")
}

func TestStartMount_WithRTP_AddsRTPOutput(t *testing.T) {
	args := buildCmd(t, "/radio", false, 5004, "AAC", "128k")
	assert.True(t, containsArg(args, "rtp://"), "RTP output missing when rtpPort > 0")
	assert.True(t, containsArg(args, "5004"), "RTP port 5004 missing in args")
}

func TestStartMount_NoRTP_NoRTPOutput(t *testing.T) {
	args := buildCmd(t, "/radio", false, 0, "AAC", "128k")
	assert.False(t, containsArg(args, "rtp://"), "RTP output should not appear when rtpPort = 0")
}

func TestStartMount_SegmentDuration_InArgs(t *testing.T) {
	s, err := hls.NewSegmenter(t.TempDir(), 4, 3) // custom durations
	require.NoError(t, err)
	cmd, err := s.StartMount(context.Background(), "/radio", false, 0, "AAC", "128k")
	require.NoError(t, err)
	assert.True(t, containsArg(cmd.Args, "4"), "segment duration 4 not in args")
}

func TestStartMount_StdinIsNil(t *testing.T) {
	// The caller must wire cmd.Stdin; NewSegmenter must not set it.
	s, err := hls.NewSegmenter(t.TempDir(), 6, 5)
	require.NoError(t, err)
	cmd, err := s.StartMount(context.Background(), "/radio", false, 0, "AAC", "128k")
	require.NoError(t, err)
	assert.Nil(t, cmd.Stdin, "cmd.Stdin should be nil until the caller wires it")
}
