package handler

import (
	"runtime"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/api/respond"
	"github.com/riza/kast/internal/version"
)

var startTime = time.Now()

// Status godoc: GET /api/status
func Status(c *fiber.Ctx) error {
	return respond.OK(c, fiber.Map{
		"version":    version.Version,
		"git_commit": version.GitCommit,
		"build_time": version.BuildTime,
		"uptime_sec": int(time.Since(startTime).Seconds()),
		"go_version": runtime.Version(),
		"os_arch":    runtime.GOOS + "/" + runtime.GOARCH,
	})
}
