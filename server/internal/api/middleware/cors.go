package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

// CORS returns Fiber CORS middleware configured for the given allowed origins.
func CORS(allowedOrigins []string) fiber.Handler {
	return cors.New(cors.Config{
		AllowOrigins:  strings.Join(allowedOrigins, ","),
		AllowMethods:  "GET,POST,PUT,PATCH,DELETE,OPTIONS",
		AllowHeaders:  "Authorization,Content-Type",
		ExposeHeaders: "",
		MaxAge:        86400,
	})
}
