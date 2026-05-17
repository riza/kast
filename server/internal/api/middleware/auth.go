// Package middleware provides HTTP middleware for the Kast API.
package middleware

import (
	"crypto/subtle"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/authmanager"
)

// BearerAuth returns middleware that accepts: HttpOnly cookie (browser sessions),
// JWT Bearer header, or static API key. Sets c.Locals("user") to *authmanager.Claims.
func BearerAuth(apiKey string, auth *authmanager.Manager) fiber.Handler {
	wantKey := []byte("Bearer " + apiKey)
	return func(c *fiber.Ctx) error {
		// 1. Cookie — browser sessions via Next.js proxy.
		if cookie := c.Cookies("kast_token"); cookie != "" {
			if claims, err := auth.Verify(cookie); err == nil {
				c.Locals("user", claims)
				return c.Next()
			}
		}

		// 2. Authorization header — direct API / script access.
		raw := strings.TrimSpace(c.Get("Authorization"))
		if raw != "" {
			if strings.HasPrefix(raw, "Bearer ") {
				tokenStr := raw[7:]
				if claims, err := auth.Verify(tokenStr); err == nil {
					c.Locals("user", claims)
					return c.Next()
				}
			}
			// Static API key fallback.
			if subtle.ConstantTimeCompare([]byte(raw), wantKey) == 1 {
				c.Locals("user", &authmanager.Claims{
					UserID:   "api-key",
					Username: "api-key",
					Role:     authmanager.RoleAdmin,
				})
				return c.Next()
			}
		}

		c.Set("WWW-Authenticate", `Bearer realm="kast"`)
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
}

// RequireRole returns middleware that allows only users with one of the given roles.
// Must be placed after BearerAuth (which sets c.Locals("user")).
func RequireRole(roles ...authmanager.Role) fiber.Handler {
	allowed := make(map[authmanager.Role]bool, len(roles))
	for _, r := range roles {
		allowed[r] = true
	}
	return func(c *fiber.Ctx) error {
		claims, ok := c.Locals("user").(*authmanager.Claims)
		if !ok || !allowed[claims.Role] {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden"})
		}
		return c.Next()
	}
}
