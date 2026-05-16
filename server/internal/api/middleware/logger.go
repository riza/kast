package middleware

import (
	"log/slog"
	"time"

	"github.com/gofiber/fiber/v2"
)

// Logger returns structured request/response logging middleware using slog.
func Logger() fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()
		err := c.Next()
		slog.Info("request",
			"method", c.Method(),
			"path", c.Path(),
			"status", c.Response().StatusCode(),
			"bytes", len(c.Response().Body()),
			"duration_ms", time.Since(start).Milliseconds(),
			"remote", c.IP(),
		)
		return err
	}
}
