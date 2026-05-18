package handler

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/api/respond"
	"github.com/riza/kast/internal/webhook"
)

// Webhooks groups webhook management handlers.
type Webhooks struct {
	Manager *webhook.Manager
}

// List godoc: GET /api/webhooks
func (h *Webhooks) List(c *fiber.Ctx) error {
	whs := h.Manager.List()
	if whs == nil {
		whs = []*webhook.Webhook{}
	}
	return respond.OK(c, whs)
}

// Get godoc: GET /api/webhooks/:id
func (h *Webhooks) Get(c *fiber.Ctx) error {
	id := c.Params("id")
	wh, err := h.Manager.Get(id)
	if errors.Is(err, webhook.ErrNotFound) {
		return respond.Error(c, fiber.StatusNotFound, "webhook not found")
	}
	return respond.OK(c, wh)
}

// Create godoc: POST /api/webhooks
func (h *Webhooks) Create(c *fiber.Ctx) error {
	var req webhook.CreateRequest
	if err := c.BodyParser(&req); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "invalid JSON")
	}
	wh, err := h.Manager.Create(req)
	if err != nil {
		return respond.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return respond.Created(c, wh)
}

// Update godoc: PATCH /api/webhooks/:id
func (h *Webhooks) Update(c *fiber.Ctx) error {
	id := c.Params("id")
	var req webhook.UpdateRequest
	if err := c.BodyParser(&req); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "invalid JSON")
	}
	wh, err := h.Manager.Update(id, req)
	if errors.Is(err, webhook.ErrNotFound) {
		return respond.Error(c, fiber.StatusNotFound, "webhook not found")
	}
	if err != nil {
		return respond.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return respond.OK(c, wh)
}

// Delete godoc: DELETE /api/webhooks/:id
func (h *Webhooks) Delete(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := h.Manager.Delete(id); errors.Is(err, webhook.ErrNotFound) {
		return respond.Error(c, fiber.StatusNotFound, "webhook not found")
	}
	return c.SendStatus(fiber.StatusNoContent)
}
