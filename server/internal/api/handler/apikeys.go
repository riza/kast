package handler

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/api/respond"
	"github.com/riza/kast/internal/apikey"
)

// APIKeys groups API key management handlers.
type APIKeys struct {
	Manager *apikey.Manager
}

// List godoc: GET /api/apikeys
func (h *APIKeys) List(c *fiber.Ctx) error {
	keys := h.Manager.List()
	if keys == nil {
		keys = []*apikey.APIKey{}
	}
	return respond.OK(c, keys)
}

// Create godoc: POST /api/apikeys
func (h *APIKeys) Create(c *fiber.Ctx) error {
	var req apikey.CreateRequest
	if err := c.BodyParser(&req); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "invalid JSON")
	}
	resp, err := h.Manager.Create(req)
	if err != nil {
		return respond.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return respond.Created(c, resp)
}

// Update godoc: PATCH /api/apikeys/:id
func (h *APIKeys) Update(c *fiber.Ctx) error {
	id := c.Params("id")
	var req apikey.UpdateRequest
	if err := c.BodyParser(&req); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "invalid JSON")
	}
	k, err := h.Manager.Update(id, req)
	if errors.Is(err, apikey.ErrNotFound) {
		return respond.Error(c, fiber.StatusNotFound, "api key not found")
	}
	if err != nil {
		return respond.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return respond.OK(c, k)
}

// Delete godoc: DELETE /api/apikeys/:id
func (h *APIKeys) Delete(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := h.Manager.Delete(id); errors.Is(err, apikey.ErrNotFound) {
		return respond.Error(c, fiber.StatusNotFound, "api key not found")
	}
	return c.SendStatus(fiber.StatusNoContent)
}
