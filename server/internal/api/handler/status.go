package handler

import (
	"runtime"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/api/respond"
)

var startTime = time.Now()

// Status godoc: GET /api/status
func Status(c *fiber.Ctx) error {
	return respond.OK(c, fiber.Map{
		"version":    "0.1.0",
		"uptime_sec": int(time.Since(startTime).Seconds()),
		"go_version": runtime.Version(),
		"os_arch":    runtime.GOOS + "/" + runtime.GOARCH,
	})
}
