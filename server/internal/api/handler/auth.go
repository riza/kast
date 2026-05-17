package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/api/respond"
	"github.com/riza/kast/internal/authmanager"
)

type Auth struct {
	Manager *authmanager.Manager
}

func (h *Auth) SetupStatus(c *fiber.Ctx) error {
	return respond.OK(c, fiber.Map{"required": h.Manager.IsSetupRequired()})
}

func (h *Auth) Setup(c *fiber.Ctx) error {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&body); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "invalid JSON")
	}
	token, user, err := h.Manager.Setup(body.Username, body.Password)
	if err != nil {
		return respond.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return respond.OK(c, fiber.Map{"token": token, "user": user})
}

func (h *Auth) Login(c *fiber.Ctx) error {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&body); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "invalid JSON")
	}
	token, user, err := h.Manager.Login(body.Username, body.Password)
	if err != nil {
		return respond.Error(c, fiber.StatusUnauthorized, "invalid credentials")
	}
	return respond.OK(c, fiber.Map{
		"token": token,
		"user":  user,
	})
}

func (h *Auth) Me(c *fiber.Ctx) error {
	claims := c.Locals("user").(*authmanager.Claims)
	user, err := h.Manager.GetUser(claims.UserID)
	if err != nil {
		return respond.Error(c, fiber.StatusNotFound, "user not found")
	}
	return respond.OK(c, user)
}
