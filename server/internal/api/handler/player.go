package handler

import (
	_ "embed"

	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/api/respond"
	"github.com/riza/kast/internal/mount"
)

//go:embed player.html
var playerHTML []byte

// Player serves the public web player page for a given mount.
type Player struct {
	Manager *mount.Manager
}

// ServeHTTP handles GET /player/:mount — serves the standalone HTML player.
func (h *Player) ServeHTTP(c *fiber.Ctx) error {
	mountName := "/" + c.Params("mount")
	if _, err := h.Manager.Get(mountName); err != nil {
		return respond.Error(c, fiber.StatusNotFound, "mount not found")
	}
	c.Set("Content-Type", "text/html; charset=utf-8")
	c.Set("Cache-Control", "no-store")
	return c.Send(playerHTML)
}
