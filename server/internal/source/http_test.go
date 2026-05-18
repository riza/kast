// White-box tests: same package so we can test unexported fanOut directly.
package source

import (
	"bytes"
	"io"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockWriter captures bytes written to it.
type mockWriter struct {
	mu  sync.Mutex
	buf bytes.Buffer
	err error // if non-nil, Write returns this error
}

func (m *mockWriter) Write(p []byte) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.err != nil {
		return 0, m.err
	}
	return m.buf.Write(p)
}

func (m *mockWriter) Close() error { return nil }

func (m *mockWriter) Bytes() []byte {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]byte(nil), m.buf.Bytes()...)
}

var _ io.WriteCloser = (*mockWriter)(nil)

// ── NewHandler ───────────────────────────────────────────────────────────────

func TestNewHandler(t *testing.T) {
	h := NewHandler()
	require.NotNil(t, h)
}

// ── RegisterConsumer ─────────────────────────────────────────────────────────

func TestRegisterConsumer_ReturnsCancelFunc(t *testing.T) {
	h := NewHandler()
	w := &mockWriter{}
	cancel := h.RegisterConsumer("mount1", w)
	require.NotNil(t, cancel)
}

func TestRegisterConsumer_Cancel_RemovesConsumer(t *testing.T) {
	h := NewHandler()
	w := &mockWriter{}
	cancel := h.RegisterConsumer("mount1", w)

	cancel()

	// After cancel, fanOut must not deliver data to w.
	h.fanOut("mount1", []byte("dropped"))
	assert.Empty(t, w.Bytes())
}

func TestRegisterConsumer_Cancel_Idempotent(t *testing.T) {
	h := NewHandler()
	cancel := h.RegisterConsumer("mount1", &mockWriter{})
	// Calling cancel twice must not panic.
	cancel()
	cancel()
}

// ── fanOut ───────────────────────────────────────────────────────────────────

func TestFanOut_NoConsumers(t *testing.T) {
	h := NewHandler()
	// Must not panic when no consumers are registered.
	h.fanOut("mount1", []byte("data"))
}

func TestFanOut_SingleConsumer(t *testing.T) {
	h := NewHandler()
	w := &mockWriter{}
	h.RegisterConsumer("mount1", w)

	h.fanOut("mount1", []byte("hello world"))
	assert.Equal(t, []byte("hello world"), w.Bytes())
}

func TestFanOut_MultipleConsumers(t *testing.T) {
	h := NewHandler()
	w1 := &mockWriter{}
	w2 := &mockWriter{}
	h.RegisterConsumer("mount1", w1)
	h.RegisterConsumer("mount1", w2)

	h.fanOut("mount1", []byte("audio"))
	assert.Equal(t, []byte("audio"), w1.Bytes())
	assert.Equal(t, []byte("audio"), w2.Bytes())
}

func TestFanOut_MountsAreIsolated(t *testing.T) {
	h := NewHandler()
	w1 := &mockWriter{}
	w2 := &mockWriter{}
	h.RegisterConsumer("mount1", w1)
	h.RegisterConsumer("mount2", w2)

	h.fanOut("mount1", []byte("for mount1"))
	assert.Equal(t, []byte("for mount1"), w1.Bytes())
	assert.Empty(t, w2.Bytes())
}

func TestFanOut_MultipleChunks(t *testing.T) {
	h := NewHandler()
	w := &mockWriter{}
	h.RegisterConsumer("stream", w)

	h.fanOut("stream", []byte("chunk1"))
	h.fanOut("stream", []byte("chunk2"))
	h.fanOut("stream", []byte("chunk3"))

	assert.Equal(t, []byte("chunk1chunk2chunk3"), w.Bytes())
}

func TestFanOut_ErrorConsumerDoesNotBlockOthers(t *testing.T) {
	h := NewHandler()
	failing := &mockWriter{err: io.ErrClosedPipe}
	good := &mockWriter{}
	h.RegisterConsumer("mount1", failing)
	h.RegisterConsumer("mount1", good)

	// Must not panic; good consumer should still receive data.
	h.fanOut("mount1", []byte("data"))
	assert.Equal(t, []byte("data"), good.Bytes())
}

func TestRegisterConsumer_OnlyCancelsSpecificConsumer(t *testing.T) {
	h := NewHandler()
	w1 := &mockWriter{}
	w2 := &mockWriter{}
	cancel1 := h.RegisterConsumer("mount1", w1)
	h.RegisterConsumer("mount1", w2)

	cancel1()

	h.fanOut("mount1", []byte("only w2"))
	assert.Empty(t, w1.Bytes())
	assert.Equal(t, []byte("only w2"), w2.Bytes())
}
