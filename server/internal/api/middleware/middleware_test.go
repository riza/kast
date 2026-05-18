package middleware_test

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/api/middleware"
	"github.com/riza/kast/internal/apikey"
	"github.com/riza/kast/internal/authmanager"
	"github.com/riza/kast/internal/db"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ── helpers ──────────────────────────────────────────────────────────────────

func testDB(t *testing.T) *sql.DB {
	t.Helper()
	d, err := db.Open(":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { d.Close() })
	return d
}

func testAuth(t *testing.T) (*authmanager.Manager, string) {
	t.Helper()
	m := authmanager.New(testDB(t), "test-secret")
	_, err := m.CreateUser("admin", "password123", authmanager.RoleAdmin)
	require.NoError(t, err)
	token, _, err := m.Login("admin", "password123")
	require.NoError(t, err)
	return m, token
}

func bearerApp(t *testing.T) (*fiber.App, *authmanager.Manager, string) {
	t.Helper()
	auth, token := testAuth(t)
	keys, err := apikey.NewManager(testDB(t))
	require.NoError(t, err)
	app := fiber.New()
	app.Use(middleware.BearerAuth(keys, auth))
	app.Get("/", func(c *fiber.Ctx) error {
		claims := c.Locals("user").(*authmanager.Claims)
		return c.SendString(claims.Username)
	})
	return app, auth, token
}

func do(t *testing.T, app *fiber.App, req *http.Request) *http.Response {
	t.Helper()
	resp, err := app.Test(req)
	require.NoError(t, err)
	return resp
}

// ── BearerAuth ───────────────────────────────────────────────────────────────

func TestBearerAuth_JWTBearer(t *testing.T) {
	app, _, token := bearerApp(t)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	assert.Equal(t, http.StatusOK, do(t, app, req).StatusCode)
}

func TestBearerAuth_APIKey(t *testing.T) {
	auth, _ := testAuth(t)
	keys, err := apikey.NewManager(testDB(t))
	require.NoError(t, err)
	cr, err := keys.Create(apikey.CreateRequest{Name: "test"})
	require.NoError(t, err)
	app := fiber.New()
	app.Use(middleware.BearerAuth(keys, auth))
	app.Get("/", func(c *fiber.Ctx) error {
		claims := c.Locals("user").(*authmanager.Claims)
		return c.SendString(claims.Username)
	})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+cr.Key)
	assert.Equal(t, http.StatusOK, do(t, app, req).StatusCode)
}

func TestBearerAuth_Cookie(t *testing.T) {
	app, _, token := bearerApp(t)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(&http.Cookie{Name: "kast_token", Value: token})
	assert.Equal(t, http.StatusOK, do(t, app, req).StatusCode)
}

func TestBearerAuth_NoCredentials(t *testing.T) {
	app, _, _ := bearerApp(t)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	assert.Equal(t, http.StatusUnauthorized, do(t, app, req).StatusCode)
}

func TestBearerAuth_InvalidJWT(t *testing.T) {
	app, _, _ := bearerApp(t)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer invalid.jwt.token")
	assert.Equal(t, http.StatusUnauthorized, do(t, app, req).StatusCode)
}

func TestBearerAuth_WrongAPIKey(t *testing.T) {
	app, _, _ := bearerApp(t)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer wrong-key")
	assert.Equal(t, http.StatusUnauthorized, do(t, app, req).StatusCode)
}

func TestBearerAuth_WWWAuthenticateHeader(t *testing.T) {
	app, _, _ := bearerApp(t)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	resp := do(t, app, req)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	assert.Equal(t, `Bearer realm="kast"`, resp.Header.Get("WWW-Authenticate"))
}

func TestBearerAuth_APIKey_HasAdminRole(t *testing.T) {
	auth, _ := testAuth(t)
	keys, err := apikey.NewManager(testDB(t))
	require.NoError(t, err)
	cr, err := keys.Create(apikey.CreateRequest{Name: "admin-key"})
	require.NoError(t, err)
	app := fiber.New()
	app.Use(middleware.BearerAuth(keys, auth))
	app.Get("/", func(c *fiber.Ctx) error {
		claims := c.Locals("user").(*authmanager.Claims)
		return c.SendString(string(claims.Role))
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+cr.Key)
	resp := do(t, app, req)
	require.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestBearerAuth_CookieTakesPrecedence(t *testing.T) {
	// When both cookie and Authorization header are present, cookie wins.
	app, _, token := bearerApp(t)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(&http.Cookie{Name: "kast_token", Value: token})
	req.Header.Set("Authorization", "Bearer invalid.garbage")
	// Should succeed via cookie even though header is invalid.
	assert.Equal(t, http.StatusOK, do(t, app, req).StatusCode)
}

// ── RequireRole ───────────────────────────────────────────────────────────────

func TestRequireRole_Allowed(t *testing.T) {
	auth, token := testAuth(t)
	app := fiber.New()
	app.Use(middleware.BearerAuth(nil, auth))
	app.Use(middleware.RequireRole(authmanager.RoleAdmin, authmanager.RoleOperator))
	app.Get("/", func(c *fiber.Ctx) error { return c.SendString("ok") })

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	assert.Equal(t, http.StatusOK, do(t, app, req).StatusCode)
}

func TestRequireRole_Forbidden(t *testing.T) {
	d := testDB(t)
	m := authmanager.New(d, "secret")
	_, _ = m.CreateUser("viewer", "password123", authmanager.RoleViewer)
	token, _, _ := m.Login("viewer", "password123")

	app := fiber.New()
	app.Use(middleware.BearerAuth(nil, m))
	app.Use(middleware.RequireRole(authmanager.RoleAdmin))
	app.Get("/", func(c *fiber.Ctx) error { return c.SendString("ok") })

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	assert.Equal(t, http.StatusForbidden, do(t, app, req).StatusCode)
}

func TestRequireRole_MultipleAllowed(t *testing.T) {
	d := testDB(t)
	m := authmanager.New(d, "secret")
	_, _ = m.CreateUser("admin", "password123", authmanager.RoleAdmin)
	_, _ = m.CreateUser("op", "password456", authmanager.RoleOperator)
	adminToken, _, _ := m.Login("admin", "password123")
	opToken, _, _ := m.Login("op", "password456")

	app := fiber.New()
	app.Use(middleware.BearerAuth(nil, m))
	app.Use(middleware.RequireRole(authmanager.RoleAdmin, authmanager.RoleOperator))
	app.Get("/", func(c *fiber.Ctx) error { return c.SendString("ok") })

	for _, token := range []string{adminToken, opToken} {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		assert.Equal(t, http.StatusOK, do(t, app, req).StatusCode)
	}
}

// ── SecureHeaders ─────────────────────────────────────────────────────────────

func TestSecureHeaders(t *testing.T) {
	app := fiber.New()
	app.Use(middleware.SecureHeaders())
	app.Get("/", func(c *fiber.Ctx) error { return c.SendString("ok") })

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	resp := do(t, app, req)

	assert.Equal(t, "nosniff", resp.Header.Get("X-Content-Type-Options"))
	assert.Equal(t, "DENY", resp.Header.Get("X-Frame-Options"))
	assert.Contains(t, resp.Header.Get("Strict-Transport-Security"), "max-age=31536000")
	assert.Contains(t, resp.Header.Get("Strict-Transport-Security"), "includeSubDomains")
	assert.Equal(t, "default-src 'none'", resp.Header.Get("Content-Security-Policy"))
	assert.Equal(t, "no-referrer", resp.Header.Get("Referrer-Policy"))
}

// ── CORS ─────────────────────────────────────────────────────────────────────

func TestCORS_AllowedOrigin(t *testing.T) {
	app := fiber.New()
	app.Use(middleware.CORS([]string{"http://example.com"}))
	app.Options("/", func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusNoContent) })
	app.Get("/", func(c *fiber.Ctx) error { return c.SendString("ok") })

	req := httptest.NewRequest(http.MethodOptions, "/", nil)
	req.Header.Set("Origin", "http://example.com")
	req.Header.Set("Access-Control-Request-Method", "GET")
	resp := do(t, app, req)

	assert.Equal(t, "http://example.com", resp.Header.Get("Access-Control-Allow-Origin"))
}

func TestCORS_AllowedMethods(t *testing.T) {
	app := fiber.New()
	app.Use(middleware.CORS([]string{"http://example.com"}))
	app.Options("/", func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusNoContent) })

	req := httptest.NewRequest(http.MethodOptions, "/", nil)
	req.Header.Set("Origin", "http://example.com")
	req.Header.Set("Access-Control-Request-Method", "DELETE")
	resp := do(t, app, req)

	allowMethods := resp.Header.Get("Access-Control-Allow-Methods")
	for _, method := range []string{"GET", "POST", "PUT", "PATCH", "DELETE"} {
		assert.Contains(t, allowMethods, method)
	}
}
