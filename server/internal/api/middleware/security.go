package middleware

import "github.com/gofiber/fiber/v2"

// SecureHeaders adds conservative security headers to every response.
func SecureHeaders() fiber.Handler {
	return func(c *fiber.Ctx) error {
		c.Set("X-Content-Type-Options", "nosniff")
		c.Set("X-Frame-Options", "DENY")
		c.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		c.Set("Content-Security-Policy", "default-src 'none'")
		c.Set("Referrer-Policy", "no-referrer")
		return c.Next()
	}
}
