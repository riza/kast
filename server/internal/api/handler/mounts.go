package handler

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/api/respond"
	"github.com/riza/kast/internal/mount"
)

// Mounts groups mount-related handlers with shared dependencies.
type Mounts struct {
	Manager *mount.Manager
}

// List godoc: GET /api/mounts
func (h *Mounts) List(c *fiber.Ctx) error {
	return respond.OK(c, h.Manager.List())
}

// Get godoc: GET /api/mounts/:name
func (h *Mounts) Get(c *fiber.Ctx) error {
	name := "/" + c.Params("name")
	mt, err := h.Manager.Get(name)
	if errors.Is(err, mount.ErrNotFound) {
		return respond.Error(c, fiber.StatusNotFound, "mount not found")
	}
	return respond.OK(c, mt)
}

// Create godoc: POST /api/mounts
func (h *Mounts) Create(c *fiber.Ctx) error {
	var req mount.CreateRequest
	if err := c.BodyParser(&req); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "invalid JSON")
	}
	mt, err := h.Manager.Create(req)
	if errors.Is(err, mount.ErrAlreadyExists) {
		return respond.Error(c, fiber.StatusConflict, "mount already exists")
	}
	if err != nil {
		return respond.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return respond.Created(c, mt)
}

// Delete godoc: DELETE /api/mounts/:name
func (h *Mounts) Delete(c *fiber.Ctx) error {
	name := "/" + c.Params("name")
	if err := h.Manager.Delete(name); errors.Is(err, mount.ErrNotFound) {
		return respond.Error(c, fiber.StatusNotFound, "mount not found")
	}
	return c.SendStatus(fiber.StatusNoContent)
}
