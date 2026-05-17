package handler

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/api/respond"
	"github.com/riza/kast/internal/authmanager"
)

const cookieName = "kast_token"

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
	setAuthCookie(c, token)
	return respond.OK(c, fiber.Map{"user": user})
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
	setAuthCookie(c, token)
	return respond.OK(c, fiber.Map{"user": user})
}

func (h *Auth) Logout(c *fiber.Ctx) error {
	c.Cookie(&fiber.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		HTTPOnly: true,
		SameSite: "Lax",
	})
	return respond.OK(c, fiber.Map{"status": "ok"})
}

func (h *Auth) Me(c *fiber.Ctx) error {
	claims := c.Locals("user").(*authmanager.Claims)
	// API key access has no real user row
	if claims.UserID == "api-key" {
		return respond.OK(c, fiber.Map{
			"id":       "api-key",
			"username": "api-key",
			"role":     "admin",
		})
	}
	user, err := h.Manager.GetUser(claims.UserID)
	if err != nil {
		return respond.Error(c, fiber.StatusNotFound, "user not found")
	}
	return respond.OK(c, user)
}

func setAuthCookie(c *fiber.Ctx, token string) {
	c.Cookie(&fiber.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   86400, // 24h
		HTTPOnly: true,
		SameSite: "Lax",
	})
}
