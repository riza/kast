// Package livesource manages live encoder sessions (one per mount).
// When an encoder (OBS, BUTT, Liquidsoap) connects via PUT /source/{mount},
// this manager starts an ffmpeg HLS segmenter process and pipes the incoming
// audio into it, mirroring the AutoDJ pipeline pattern.
package livesource

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os/exec"
	"sync"

	"github.com/riza/kast/internal/hls"
	"github.com/riza/kast/internal/mount"
	"github.com/riza/kast/internal/source"
	"github.com/riza/kast/internal/webhook"
)

type session struct {
	cmd        *exec.Cmd
	pipeW      *io.PipeWriter
	cancel     context.CancelFunc
	deregister context.CancelFunc
}

// Manager runs at most one live source session per mount.
type Manager struct {
	mu        sync.Mutex
	sessions  map[string]*session
	segmenter *hls.Segmenter
	mounts    *mount.Manager
	src       *source.Handler
	webhooks  *webhook.Manager
}

// NewManager creates a Manager wired to the given dependencies.
func NewManager(
	segmenter *hls.Segmenter,
	mounts *mount.Manager,
	src *source.Handler,
	webhooks *webhook.Manager,
) *Manager {
	return &Manager{
		sessions:  make(map[string]*session),
		segmenter: segmenter,
		mounts:    mounts,
		src:       src,
		webhooks:  webhooks,
	}
}

// Connect starts the HLS pipeline for an encoder connecting to mountName.
// Returns an error if the mount is already live or if ffmpeg fails to start.
// Call Disconnect when the encoder disconnects.
func (m *Manager) Connect(mountName string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.sessions[mountName]; ok {
		return fmt.Errorf("mount %s already has an active source connection", mountName)
	}

	// Reject if AutoDJ or another process already owns this mount.
	if mt, err := m.mounts.Get(mountName); err == nil && mt.Status == mount.StatusLive {
		return fmt.Errorf("mount %s is already live", mountName)
	}

	// Read per-mount codec/bitrate settings.
	llhls := false
	codec := "AAC"
	bitrate := "128k"
	if mt, err := m.mounts.Get(mountName); err == nil {
		llhls = mt.Protocol == "LL-HLS"
		if mt.Codec != "" {
			codec = mt.Codec
		}
		if mt.Bitrate != "" {
			bitrate = mt.Bitrate
		}
	}

	sessCtx, cancel := context.WithCancel(context.Background())
	pipeR, pipeW := io.Pipe()

	hlsCmd, err := m.segmenter.StartMount(sessCtx, mountName, llhls, 0, codec, bitrate)
	if err != nil {
		cancel()
		pipeR.Close()
		pipeW.Close()
		return fmt.Errorf("livesource: start segmenter for %s: %w", mountName, err)
	}
	hlsCmd.Stdin = pipeR
	if err := hlsCmd.Start(); err != nil {
		cancel()
		pipeR.Close()
		pipeW.Close()
		return fmt.Errorf("livesource: start ffmpeg for %s: %w", mountName, err)
	}

	deregister := m.src.RegisterConsumer(mountName, pipeW)

	sess := &session{
		cmd:        hlsCmd,
		pipeW:      pipeW,
		cancel:     cancel,
		deregister: deregister,
	}
	m.sessions[mountName] = sess
	m.mounts.SetStatus(mountName, mount.StatusLive)
	m.emit("mount.status.changed", map[string]any{"mount": mountName, "status": "live"})

	// Wait for ffmpeg in the background. On unexpected crash, set error status.
	go func() {
		if err := hlsCmd.Wait(); err != nil && sessCtx.Err() == nil {
			slog.Error("livesource: hls ffmpeg crashed", "mount", mountName, "err", err)
			m.mounts.SetStatus(mountName, mount.StatusError)
			m.emit("mount.status.changed", map[string]any{"mount": mountName, "status": "error"})
		}
		m.mu.Lock()
		if cur, ok := m.sessions[mountName]; ok && cur == sess {
			delete(m.sessions, mountName)
		}
		m.mu.Unlock()
	}()

	slog.Info("livesource: encoder connected", "mount", mountName)
	return nil
}

// Disconnect tears down the live source session for mountName.
// Safe to call even if the ffmpeg process already exited unexpectedly.
func (m *Manager) Disconnect(mountName string) {
	m.mu.Lock()
	sess, ok := m.sessions[mountName]
	if ok {
		delete(m.sessions, mountName)
	}
	m.mu.Unlock()

	if ok {
		sess.deregister()
		sess.pipeW.Close() // signals EOF to ffmpeg stdin → clean exit
		sess.cancel()
	}
	// Always reset status when the encoder leaves, even if ffmpeg already crashed.
	m.mounts.SetStatus(mountName, mount.StatusIdle)
	m.emit("mount.status.changed", map[string]any{"mount": mountName, "status": "idle"})
	slog.Info("livesource: encoder disconnected", "mount", mountName)
}

// StopAll tears down every active session. Call during graceful shutdown.
func (m *Manager) StopAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for name, sess := range m.sessions {
		sess.deregister()
		sess.pipeW.Close()
		sess.cancel()
		delete(m.sessions, name)
		slog.Info("livesource: stopped on shutdown", "mount", name)
	}
}

func (m *Manager) emit(event string, data map[string]any) {
	if m.webhooks != nil {
		m.webhooks.Emit(event, data)
	}
}
