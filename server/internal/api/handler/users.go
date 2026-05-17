package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/api/respond"
	"github.com/riza/kast/internal/authmanager"
)

type Users struct {
	Manager *authmanager.Manager
}

func (h *Users) List(c *fiber.Ctx) error {
	users, err := h.Manager.ListUsers()
	if err != nil {
		return respond.Error(c, fiber.StatusInternalServerError, "failed to list users")
	}
	return respond.OK(c, users)
}

func (h *Users) Create(c *fiber.Ctx) error {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}
	if err := c.BodyParser(&body); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "invalid JSON")
	}
	role := authmanager.Role(body.Role)
	switch role {
	case authmanager.RoleAdmin, authmanager.RoleOperator, authmanager.RoleViewer:
	default:
		role = authmanager.RoleViewer
	}
	user, err := h.Manager.CreateUser(body.Username, body.Password, role)
	if err != nil {
		return respond.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return respond.OK(c, user)
}

func (h *Users) Delete(c *fiber.Ctx) error {
	id := c.Params("id")
	// Prevent self-deletion.
	claims := c.Locals("user").(*authmanager.Claims)
	if claims.UserID == id {
		return respond.Error(c, fiber.StatusBadRequest, "cannot delete your own account")
	}
	if err := h.Manager.DeleteUser(id); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return respond.OK(c, fiber.Map{"status": "ok"})
}

func (h *Users) Update(c *fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Role     string `json:"role"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&body); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "invalid JSON")
	}
	if body.Role != "" {
		role := authmanager.Role(body.Role)
		switch role {
		case authmanager.RoleAdmin, authmanager.RoleOperator, authmanager.RoleViewer:
		default:
			return respond.Error(c, fiber.StatusBadRequest, "invalid role")
		}
		if err := h.Manager.ChangeRole(id, role); err != nil {
			return respond.Error(c, fiber.StatusBadRequest, err.Error())
		}
	}
	if body.Password != "" {
		if err := h.Manager.ChangePassword(id, body.Password); err != nil {
			return respond.Error(c, fiber.StatusBadRequest, err.Error())
		}
	}
	user, err := h.Manager.GetUser(id)
	if err != nil {
		return respond.Error(c, fiber.StatusNotFound, "user not found")
	}
	return respond.OK(c, user)
}
