// Package source handles live audio source connections (Icecast-compatible HTTP PUT).
package source

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"sync"

	"github.com/gofiber/fiber/v2"
)

// Handler accepts Icecast-compatible HTTP PUT source connections.
// Encoders (OBS, BUTT, Mixxx, liquidsoap) connect by sending:
//
//	PUT /source/<mountname> HTTP/1.0
//	Authorization: Bearer <source_password>
//	Content-Type: audio/mpeg   (or audio/aac, etc.)
//
// The incoming audio stream is fanned out to any registered consumers.
type Handler struct {
	mu        sync.RWMutex
	consumers map[string][]io.WriteCloser // mount name → active consumers
}

// NewHandler creates a new source Handler.
func NewHandler() *Handler {
	return &Handler{consumers: make(map[string][]io.WriteCloser)}
}

// RegisterConsumer adds a consumer pipe for a mount.
// The consumer receives raw audio bytes as they arrive.
// Call the returned cancel func to deregister.
func (h *Handler) RegisterConsumer(mountName string, w io.WriteCloser) context.CancelFunc {
	h.mu.Lock()
	h.consumers[mountName] = append(h.consumers[mountName], w)
	h.mu.Unlock()

	return func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		cs := h.consumers[mountName]
		for i, c := range cs {
			if c == w {
				h.consumers[mountName] = append(cs[:i], cs[i+1:]...)
				break
			}
		}
	}
}

// ServeHTTPFiber handles an incoming source connection for a specific mount.
// It reads the streaming request body and fans out audio data to consumers.
func (h *Handler) ServeHTTPFiber(c *fiber.Ctx, mountName string) {
	slog.Info("source: encoder connected", "mount", mountName, "remote", c.IP())
	defer slog.Info("source: encoder disconnected", "mount", mountName, "remote", c.IP())

	c.Status(fiber.StatusOK)
	c.Set("Content-Type", "text/plain")

	// Read from the request body stream (fasthttp streaming mode).
	body := c.Context().RequestBodyStream()
	if body == nil {
		// Fall back to buffered body if streaming is not available.
		slog.Warn("source: no streaming body available", "mount", mountName)
		return
	}

	buf := make([]byte, 32*1024)
	for {
		n, err := body.Read(buf)
		if n > 0 {
			h.fanOut(mountName, buf[:n])
		}
		if err != nil {
			if err != io.EOF {
				slog.Warn("source: read error", "mount", mountName, "err", err)
			}
			return
		}
	}
}

func (h *Handler) fanOut(mountName string, data []byte) {
	h.mu.RLock()
	consumers := h.consumers[mountName]
	h.mu.RUnlock()

	for _, c := range consumers {
		if _, err := c.Write(data); err != nil {
			slog.Warn("source: consumer write error", "mount", mountName, "err", fmt.Sprintf("%v", err))
		}
	}
}
