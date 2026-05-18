// Package middleware provides HTTP middleware for the Kast API.
package middleware

import (
	"errors"
	"net"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/apikey"
	"github.com/riza/kast/internal/authmanager"
)

// BearerAuth returns middleware that accepts: HttpOnly cookie (browser sessions),
// JWT Bearer header, or a dynamic API key. Sets c.Locals("user") to *authmanager.Claims.
func BearerAuth(keys *apikey.Manager, auth *authmanager.Manager) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// 1. Cookie — browser sessions via Next.js proxy.
		if cookie := c.Cookies("kast_token"); cookie != "" {
			if claims, err := auth.Verify(cookie); err == nil {
				c.Locals("user", claims)
				return c.Next()
			}
		}

		// 2. Authorization header — JWT or dynamic API key.
		raw := strings.TrimSpace(c.Get("Authorization"))
		if raw != "" && strings.HasPrefix(raw, "Bearer ") {
			tokenStr := raw[7:]

			// 2a. Try JWT first (no DB lookup needed).
			if claims, err := auth.Verify(tokenStr); err == nil {
				c.Locals("user", claims)
				return c.Next()
			}

			// 2b. Try dynamic API key.
			if keys != nil {
				k, err := keys.Lookup(tokenStr)
				if err == nil {
					if len(k.IPAllowlist) > 0 && !keys.ValidateIP(k, c.IP()) {
						return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "IP not in allowlist"})
					}
					c.Locals("user", &authmanager.Claims{
						UserID:   "api:" + k.ID,
						Username: "api-key:" + k.Name,
						Role:     authmanager.RoleAdmin,
					})
					return c.Next()
				}
				if errors.Is(err, apikey.ErrDisabled) {
					return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "API key disabled"})
				}
				if errors.Is(err, apikey.ErrExpired) {
					return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "API key expired"})
				}
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

// IPAllowlist returns middleware that blocks requests whose source IP is not
// in any of the given CIDRs. An empty list allows all IPs.
// CIDRs are parsed once at call time; invalid entries are silently skipped.
func IPAllowlist(cidrs []string) fiber.Handler {
	if len(cidrs) == 0 {
		return func(c *fiber.Ctx) error { return c.Next() }
	}

	nets := make([]*net.IPNet, 0, len(cidrs))
	for _, cidr := range cidrs {
		if !strings.Contains(cidr, "/") {
			if ip := net.ParseIP(cidr); ip != nil {
				if ip.To4() != nil {
					cidr = cidr + "/32"
				} else {
					cidr = cidr + "/128"
				}
			}
		}
		_, ipNet, err := net.ParseCIDR(cidr)
		if err == nil {
			nets = append(nets, ipNet)
		}
	}

	return func(c *fiber.Ctx) error {
		ip := net.ParseIP(c.IP())
		if ip == nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden"})
		}
		for _, n := range nets {
			if n.Contains(ip) {
				return c.Next()
			}
		}
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden"})
	}
}
