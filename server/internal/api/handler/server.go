package handler

import (
	"log/slog"
	"os"
	"path/filepath"
	"syscall"

	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/api/respond"
)

// Server handles administrative server lifecycle operations.
type Server struct {
	ConfigPath string
	DataDir    string
}

// Restart godoc: POST /api/server/restart
func (h *Server) Restart(c *fiber.Ctx) error {
	slog.Info("restart requested via API")
	go func() {
		p, err := os.FindProcess(os.Getpid())
		if err != nil {
			slog.Error("restart: find process", "err", err)
			return
		}
		_ = p.Signal(syscall.SIGTERM)
	}()
	return respond.OK(c, fiber.Map{"message": "server restarting"})
}

// FactoryReset godoc: DELETE /api/server/reset
func (h *Server) FactoryReset(c *fiber.Ctx) error {
	slog.Warn("factory reset requested via API — wiping config and data")

	if err := os.Remove(h.ConfigPath); err != nil && !os.IsNotExist(err) {
		return respond.Error(c, fiber.StatusInternalServerError, "failed to delete config file")
	}

	dbPath := filepath.Join(h.DataDir, "kast.db")
	if err := os.Remove(dbPath); err != nil && !os.IsNotExist(err) {
		return respond.Error(c, fiber.StatusInternalServerError, "failed to delete database")
	}

	go func() {
		p, err := os.FindProcess(os.Getpid())
		if err != nil {
			slog.Error("factory reset: find process", "err", err)
			return
		}
		_ = p.Signal(syscall.SIGTERM)
	}()

	return respond.OK(c, fiber.Map{"message": "factory reset initiated"})
}
