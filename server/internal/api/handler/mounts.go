package handler

import (
	"errors"
	"log/slog"

	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/api/respond"
	"github.com/riza/kast/internal/djmanager"
	"github.com/riza/kast/internal/mount"
)

// Mounts groups mount-related handlers with shared dependencies.
type Mounts struct {
	Manager   *mount.Manager
	DJManager *djmanager.Manager
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

// Update godoc: PATCH /api/mounts/:name
func (h *Mounts) Update(c *fiber.Ctx) error {
	name := "/" + c.Params("name")
	var req mount.MetadataUpdate
	if err := c.BodyParser(&req); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "invalid JSON")
	}

	// Snapshot audio config before update to detect changes.
	before, _ := h.Manager.Get(name)

	err := h.Manager.UpdateMetadata(name, req)
	if errors.Is(err, mount.ErrNotFound) {
		return respond.Error(c, fiber.StatusNotFound, "mount not found")
	}
	if err != nil {
		return respond.Error(c, fiber.StatusBadRequest, err.Error())
	}
	mt, _ := h.Manager.Get(name)

	// Restart AutoDJ if audio config changed and a session is running.
	autodjRestarted := false
	if h.DJManager != nil && before != nil {
		audioChanged := (req.Codec != "" && req.Codec != before.Codec) ||
			(req.Bitrate != "" && req.Bitrate != before.Bitrate) ||
			(req.Protocol != "" && req.Protocol != before.Protocol)
		if audioChanged {
			if restarted, err := h.DJManager.RestartMount(name); err != nil {
				slog.Warn("mounts: autodj restart after audio change failed", "mount", name, "err", err)
			} else {
				autodjRestarted = restarted
			}
		}
	}

	type updateResp struct {
		*mount.Mount
		AutoDJRestarted bool `json:"autodj_restarted"`
	}
	return respond.OK(c, updateResp{Mount: mt, AutoDJRestarted: autodjRestarted})
}

// Delete godoc: DELETE /api/mounts/:name
func (h *Mounts) Delete(c *fiber.Ctx) error {
	name := "/" + c.Params("name")
	if err := h.Manager.Delete(name); errors.Is(err, mount.ErrNotFound) {
		return respond.Error(c, fiber.StatusNotFound, "mount not found")
	}
	return c.SendStatus(fiber.StatusNoContent)
}
