package respond_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/api/respond"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func testApp(handler fiber.Handler) *fiber.App {
	app := fiber.New()
	app.Get("/", handler)
	return app
}

func get(t *testing.T, app *fiber.App) *http.Response {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	return resp
}

func readJSON(t *testing.T, r io.Reader) map[string]any {
	t.Helper()
	body, err := io.ReadAll(r)
	require.NoError(t, err)
	var m map[string]any
	require.NoError(t, json.Unmarshal(body, &m))
	return m
}

func TestOK_StatusCode(t *testing.T) {
	app := testApp(func(c *fiber.Ctx) error {
		return respond.OK(c, fiber.Map{"key": "value"})
	})
	assert.Equal(t, http.StatusOK, get(t, app).StatusCode)
}

func TestOK_Body(t *testing.T) {
	app := testApp(func(c *fiber.Ctx) error {
		return respond.OK(c, fiber.Map{"msg": "hello"})
	})
	resp := get(t, app)
	body := readJSON(t, resp.Body)
	assert.Equal(t, "hello", body["msg"])
}

func TestOK_ContentType(t *testing.T) {
	app := testApp(func(c *fiber.Ctx) error {
		return respond.OK(c, fiber.Map{})
	})
	resp := get(t, app)
	assert.Contains(t, resp.Header.Get("Content-Type"), "application/json")
}

func TestCreated_StatusCode(t *testing.T) {
	app := testApp(func(c *fiber.Ctx) error {
		return respond.Created(c, fiber.Map{"id": "123"})
	})
	assert.Equal(t, http.StatusCreated, get(t, app).StatusCode)
}

func TestCreated_Body(t *testing.T) {
	app := testApp(func(c *fiber.Ctx) error {
		return respond.Created(c, fiber.Map{"id": "abc"})
	})
	resp := get(t, app)
	body := readJSON(t, resp.Body)
	assert.Equal(t, "abc", body["id"])
}

func TestError_StatusCode(t *testing.T) {
	for _, code := range []int{
		http.StatusBadRequest,
		http.StatusNotFound,
		http.StatusUnauthorized,
		http.StatusForbidden,
		http.StatusInternalServerError,
	} {
		code := code
		t.Run(http.StatusText(code), func(t *testing.T) {
			app := testApp(func(c *fiber.Ctx) error {
				return respond.Error(c, code, "msg")
			})
			assert.Equal(t, code, get(t, app).StatusCode)
		})
	}
}

func TestError_Body(t *testing.T) {
	app := testApp(func(c *fiber.Ctx) error {
		return respond.Error(c, http.StatusBadRequest, "invalid input")
	})
	resp := get(t, app)
	body := readJSON(t, resp.Body)
	assert.Equal(t, "invalid input", body["error"])
}

func TestError_EnvelopeKey(t *testing.T) {
	app := testApp(func(c *fiber.Ctx) error {
		return respond.Error(c, http.StatusNotFound, "not found")
	})
	resp := get(t, app)
	body := readJSON(t, resp.Body)
	// The envelope must use the key "error", not "message" or anything else.
	_, ok := body["error"]
	assert.True(t, ok, "response body should contain an 'error' key")
}
