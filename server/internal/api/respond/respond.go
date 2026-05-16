package respond

import "github.com/gofiber/fiber/v2"

// OK sends a 200 JSON response.
func OK(c *fiber.Ctx, v any) error {
	return c.JSON(v)
}

// Created sends a 201 JSON response.
func Created(c *fiber.Ctx, v any) error {
	return c.Status(fiber.StatusCreated).JSON(v)
}

// Error sends a JSON error envelope with the given status code.
func Error(c *fiber.Ctx, status int, msg string) error {
	return c.Status(status).JSON(fiber.Map{"error": msg})
}
