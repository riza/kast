// Package middleware provides HTTP middleware for the Kast API.
package middleware

import (
	"crypto/subtle"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// BearerAuth returns middleware that enforces a static Bearer token.
// Comparison is done in constant time to prevent timing attacks.
func BearerAuth(token string) fiber.Handler {
	want := []byte("Bearer " + token)
	return func(c *fiber.Ctx) error {
		got := []byte(strings.TrimSpace(c.Get("Authorization")))
		if len(got) == 0 || subtle.ConstantTimeCompare(got, want) != 1 {
			c.Set("WWW-Authenticate", `Bearer realm="kast"`)
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
		}
		return c.Next()
	}
}
