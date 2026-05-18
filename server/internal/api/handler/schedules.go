package handler

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/api/respond"
	"github.com/riza/kast/internal/schedule"
	"github.com/riza/kast/internal/webhook"
)

// Schedules groups schedule management handlers.
type Schedules struct {
	Manager  *schedule.Manager
	Webhooks *webhook.Manager
}

// List godoc: GET /api/schedules
func (h *Schedules) List(c *fiber.Ctx) error {
	out := h.Manager.List()
	if out == nil {
		out = []*schedule.Schedule{}
	}
	return respond.OK(c, out)
}

// Get godoc: GET /api/schedules/:id
func (h *Schedules) Get(c *fiber.Ctx) error {
	id := c.Params("id")
	s, err := h.Manager.Get(id)
	if errors.Is(err, schedule.ErrNotFound) {
		return respond.Error(c, fiber.StatusNotFound, "schedule not found")
	}
	return respond.OK(c, s)
}

// Create godoc: POST /api/schedules
func (h *Schedules) Create(c *fiber.Ctx) error {
	var req schedule.CreateRequest
	if err := c.BodyParser(&req); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "invalid JSON")
	}
	s, err := h.Manager.Create(req)
	if err != nil {
		return respond.Error(c, fiber.StatusBadRequest, err.Error())
	}
	if h.Webhooks != nil {
		h.Webhooks.Emit("schedule.created", s)
	}
	return respond.Created(c, s)
}

// Update godoc: PATCH /api/schedules/:id
func (h *Schedules) Update(c *fiber.Ctx) error {
	id := c.Params("id")
	var req schedule.UpdateRequest
	if err := c.BodyParser(&req); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "invalid JSON")
	}
	s, err := h.Manager.Update(id, req)
	if errors.Is(err, schedule.ErrNotFound) {
		return respond.Error(c, fiber.StatusNotFound, "schedule not found")
	}
	if err != nil {
		return respond.Error(c, fiber.StatusBadRequest, err.Error())
	}
	if h.Webhooks != nil {
		h.Webhooks.Emit("schedule.updated", s)
	}
	return respond.OK(c, s)
}

// Delete godoc: DELETE /api/schedules/:id
func (h *Schedules) Delete(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := h.Manager.Delete(id); errors.Is(err, schedule.ErrNotFound) {
		return respond.Error(c, fiber.StatusNotFound, "schedule not found")
	}
	if h.Webhooks != nil {
		h.Webhooks.Emit("schedule.deleted", fiber.Map{"id": id})
	}
	return c.SendStatus(fiber.StatusNoContent)
}
