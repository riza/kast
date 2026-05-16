package handler

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/api/respond"
	"github.com/riza/kast/internal/playlist"
)

// Playlists groups playlist-related handlers.
type Playlists struct {
	Manager *playlist.Manager
}

// List godoc: GET /api/playlists
func (h *Playlists) List(c *fiber.Ctx) error {
	return respond.OK(c, h.Manager.List())
}

// Get godoc: GET /api/playlists/:id
func (h *Playlists) Get(c *fiber.Ctx) error {
	id := c.Params("id")
	pl, err := h.Manager.Get(id)
	if errors.Is(err, playlist.ErrNotFound) {
		return respond.Error(c, fiber.StatusNotFound, "playlist not found")
	}
	return respond.OK(c, pl)
}

// Create godoc: POST /api/playlists
func (h *Playlists) Create(c *fiber.Ctx) error {
	var req playlist.CreateRequest
	if err := c.BodyParser(&req); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "invalid JSON")
	}
	pl, err := h.Manager.Create(req)
	if err != nil {
		return respond.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return respond.Created(c, pl)
}

// Update godoc: PUT /api/playlists/:id
func (h *Playlists) Update(c *fiber.Ctx) error {
	id := c.Params("id")
	var req playlist.UpdateRequest
	if err := c.BodyParser(&req); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "invalid JSON")
	}
	pl, err := h.Manager.Update(id, req)
	if errors.Is(err, playlist.ErrNotFound) {
		return respond.Error(c, fiber.StatusNotFound, "playlist not found")
	}
	if err != nil {
		return respond.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return respond.OK(c, pl)
}

// Delete godoc: DELETE /api/playlists/:id
func (h *Playlists) Delete(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := h.Manager.Delete(id); errors.Is(err, playlist.ErrNotFound) {
		return respond.Error(c, fiber.StatusNotFound, "playlist not found")
	}
	return c.SendStatus(fiber.StatusNoContent)
}
