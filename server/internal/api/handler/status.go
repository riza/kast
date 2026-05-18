package handler

import (
	"os"
	"runtime"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/shirou/gopsutil/v4/process"
	"github.com/riza/kast/internal/api/respond"
	"github.com/riza/kast/internal/version"
)

var startTime = time.Now()

// Status godoc: GET /api/status
func Status(c *fiber.Ctx) error {
	cpuPercent := -1.0
	memRSSMB := -1

	proc, err := process.NewProcess(int32(os.Getpid()))
	if err == nil {
		if cpu, err := proc.CPUPercent(); err == nil {
			cpuPercent = cpu
		}
		if mem, err := proc.MemoryInfo(); err == nil {
			memRSSMB = int(mem.RSS / 1024 / 1024)
		}
	}

	return respond.OK(c, fiber.Map{
		"version":     version.Version,
		"git_commit":  version.GitCommit,
		"build_time":  version.BuildTime,
		"uptime_sec":  int(time.Since(startTime).Seconds()),
		"go_version":  runtime.Version(),
		"os_arch":     runtime.GOOS + "/" + runtime.GOARCH,
		"cpu_percent": cpuPercent,
		"mem_rss_mb":  memRSSMB,
	})
}
