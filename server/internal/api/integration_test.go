// Package api_test contains end-to-end HTTP integration tests for the full
// Kast API. Every component is wired together using in-memory SQLite so no
// external services or file-system state are needed beyond a temp directory.
package api_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/riza/kast/internal/api"
	"github.com/riza/kast/internal/apikey"
	"github.com/riza/kast/internal/authmanager"
	"github.com/riza/kast/internal/config"
	"github.com/riza/kast/internal/db"
	"github.com/riza/kast/internal/djmanager"
	"github.com/riza/kast/internal/hls"
	"github.com/riza/kast/internal/library"
	"github.com/riza/kast/internal/livesource"
	"github.com/riza/kast/internal/mount"
	"github.com/riza/kast/internal/playlist"
	"github.com/riza/kast/internal/schedule"
	"github.com/riza/kast/internal/source"
	"github.com/riza/kast/internal/webrtcmanager"
	"github.com/riza/kast/internal/ytimport"
	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testEnv bundles the Fiber app with its components for convenient test access.
type testEnv struct {
	app      *fiber.App
	auth     *authmanager.Manager
	mounts   *mount.Manager
	playlists *playlist.Manager
	keys     *apikey.Manager
	adminJWT string // JWT for the test admin created in buildTestEnv
}

// buildTestEnv wires all components together and returns a ready-to-test env.
func buildTestEnv(t *testing.T) *testEnv {
	t.Helper()

	d, err := db.Open(":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { d.Close() })

	auth := authmanager.New(d, "test-jwt-secret")

	mounts, err := mount.NewManager(d)
	require.NoError(t, err)

	pls, err := playlist.NewManager(d)
	require.NoError(t, err)

	scanDir := t.TempDir()
	scanner, err := library.NewScanner([]string{scanDir}, []string{".mp3"}, d)
	require.NoError(t, err)

	hlsDir := t.TempDir()
	segmenter, err := hls.NewSegmenter(hlsDir, 6, 5)
	require.NoError(t, err)

	src := source.NewHandler()
	djm := djmanager.NewManager(segmenter, mounts, d, pls, scanner, webrtcmanager.Config{}, nil)
	ytm := ytimport.NewManager(scanDir, scanner)

	cfg := &config.Config{
		Server: config.ServerConfig{
			HTTPAddr:  ":0",
			PublicURL: "http://localhost:8080",
		},
		Admin: config.AdminConfig{
			JWTSecret: "test-jwt-secret",
		},
		HLS: config.HLSConfig{
			SegmentDuration: 6,
			PlaylistSize:    5,
			OutputDir:       hlsDir,
		},
	}

	lsm := livesource.NewManager(segmenter, mounts, src, nil)
	schedules, err := schedule.NewManager(d, mounts, pls)
	require.NoError(t, err)
	keys, err := apikey.NewManager(d)
	require.NoError(t, err)
	app := api.NewApp(cfg, "", auth, mounts, scanner, segmenter, src, pls, djm, ytm, nil, lsm, schedules, keys)
	t.Cleanup(func() { app.Shutdown() }) //nolint:errcheck

	return &testEnv{app: app, auth: auth, mounts: mounts, playlists: pls, keys: keys}
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

func (e *testEnv) do(t *testing.T, method, path string, body io.Reader, headers map[string]string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(method, path, body)
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := e.app.Test(req)
	require.NoError(t, err)
	return resp
}

// authHeaders returns headers containing a valid admin JWT.
// The admin user is created on first call (lazy init).
func (e *testEnv) authHeaders() map[string]string {
	if e.adminJWT == "" {
		token, _, err := e.auth.Setup("admin", "password123")
		if err != nil {
			token, _, err = e.auth.Login("admin", "password123")
		}
		if err == nil {
			e.adminJWT = token
		}
	}
	return map[string]string{"Authorization": "Bearer " + e.adminJWT}
}

// jwtHeaders returns headers containing a JWT for the given user token.
func jwtHeaders(token string) map[string]string {
	return map[string]string{"Authorization": "Bearer " + token}
}

func readJSON(t *testing.T, r io.Reader) map[string]any {
	t.Helper()
	body, err := io.ReadAll(r)
	require.NoError(t, err)
	var m map[string]any
	require.NoError(t, json.Unmarshal(body, &m))
	return m
}

func jsonBody(v any) *bytes.Buffer {
	b, _ := json.Marshal(v)
	return bytes.NewBuffer(b)
}

// setupAdmin creates (or reuses) the admin and returns the JWT.
func (e *testEnv) setupAdmin(t *testing.T) string {
	t.Helper()
	token, _, err := e.auth.Setup("admin", "password123")
	if err != nil {
		token, _, err = e.auth.Login("admin", "password123")
	}
	require.NoError(t, err)
	e.adminJWT = token
	return token
}

// ── Auth: /api/auth/setup ─────────────────────────────────────────────────────

func TestAPI_SetupStatus_Required(t *testing.T) {
	env := buildTestEnv(t)
	resp := env.do(t, "GET", "/api/auth/setup", nil, nil)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	body := readJSON(t, resp.Body)
	assert.Equal(t, true, body["required"])
}

func TestAPI_SetupStatus_NotRequired(t *testing.T) {
	env := buildTestEnv(t)
	env.setupAdmin(t)
	resp := env.do(t, "GET", "/api/auth/setup", nil, nil)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	body := readJSON(t, resp.Body)
	assert.Equal(t, false, body["required"])
}

func TestAPI_Setup_Success(t *testing.T) {
	env := buildTestEnv(t)
	resp := env.do(t, "POST", "/api/auth/setup",
		jsonBody(map[string]string{"username": "admin", "password": "password123"}),
		nil,
	)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	body := readJSON(t, resp.Body)
	user := body["user"].(map[string]any)
	assert.Equal(t, "admin", user["username"])
	assert.Equal(t, "admin", user["role"])
}

func TestAPI_Setup_AlreadyDone(t *testing.T) {
	env := buildTestEnv(t)
	env.setupAdmin(t)
	resp := env.do(t, "POST", "/api/auth/setup",
		jsonBody(map[string]string{"username": "admin2", "password": "password123"}),
		nil,
	)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// ── Auth: /api/auth/login ─────────────────────────────────────────────────────

func TestAPI_Login_Success(t *testing.T) {
	env := buildTestEnv(t)
	env.setupAdmin(t)

	resp := env.do(t, "POST", "/api/auth/login",
		jsonBody(map[string]string{"username": "admin", "password": "password123"}),
		nil,
	)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	// Should set an HttpOnly cookie.
	hasCookie := false
	for _, c := range resp.Cookies() {
		if c.Name == "kast_token" && c.HttpOnly {
			hasCookie = true
		}
	}
	assert.True(t, hasCookie, "kast_token HttpOnly cookie should be set on login")
}

func TestAPI_Login_WrongPassword(t *testing.T) {
	env := buildTestEnv(t)
	env.setupAdmin(t)

	resp := env.do(t, "POST", "/api/auth/login",
		jsonBody(map[string]string{"username": "admin", "password": "wrongpassword"}),
		nil,
	)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestAPI_Login_UnknownUser(t *testing.T) {
	env := buildTestEnv(t)
	resp := env.do(t, "POST", "/api/auth/login",
		jsonBody(map[string]string{"username": "nobody", "password": "password123"}),
		nil,
	)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

// ── Auth: /api/auth/logout ────────────────────────────────────────────────────

func TestAPI_Logout(t *testing.T) {
	env := buildTestEnv(t)
	resp := env.do(t, "POST", "/api/auth/logout", nil, env.authHeaders())
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// ── Auth: /api/auth/me ────────────────────────────────────────────────────────

func TestAPI_Me_APIKey(t *testing.T) {
	env := buildTestEnv(t)
	cr, err := env.keys.Create(apikey.CreateRequest{Name: "test-key"})
	require.NoError(t, err)
	resp := env.do(t, "GET", "/api/auth/me", nil, map[string]string{
		"Authorization": "Bearer " + cr.Key,
	})
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	body := readJSON(t, resp.Body)
	assert.Equal(t, "api-key:test-key", body["username"])
}

func TestAPI_Me_JWT(t *testing.T) {
	env := buildTestEnv(t)
	token := env.setupAdmin(t)
	resp := env.do(t, "GET", "/api/auth/me", nil, jwtHeaders(token))
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	body := readJSON(t, resp.Body)
	assert.Equal(t, "admin", body["username"])
}

// ── Auth enforcement ──────────────────────────────────────────────────────────

func TestAPI_Unauthenticated_Returns401(t *testing.T) {
	env := buildTestEnv(t)
	for _, path := range []string{
		"/api/mounts",
		"/api/playlists",
		"/api/library",
		"/api/auth/me",
	} {
		resp := env.do(t, "GET", path, nil, nil)
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "path %s should require auth", path)
	}
}

func TestAPI_InvalidToken_Returns401(t *testing.T) {
	env := buildTestEnv(t)
	resp := env.do(t, "GET", "/api/mounts", nil, map[string]string{
		"Authorization": "Bearer invalid.garbage.token",
	})
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

// ── Role-based access control ─────────────────────────────────────────────────

func TestAPI_ViewerCanCreateMount(t *testing.T) {
	env := buildTestEnv(t)
	env.setupAdmin(t)

	// Create a viewer user and get their token.
	_, err := env.auth.CreateUser("viewer", "password123", authmanager.RoleViewer)
	require.NoError(t, err)
	viewerToken, _, err := env.auth.Login("viewer", "password123")
	require.NoError(t, err)

	resp := env.do(t, "POST", "/api/mounts",
		jsonBody(map[string]any{"name": "/radio", "source_password": "password123"}),
		jwtHeaders(viewerToken),
	)
	// Mount creation is not restricted to admins; any authenticated user can create.
	assert.Equal(t, http.StatusCreated, resp.StatusCode)
}

func TestAPI_ViewerCanReadMounts(t *testing.T) {
	env := buildTestEnv(t)
	env.setupAdmin(t)

	_, err := env.auth.CreateUser("viewer", "password123", authmanager.RoleViewer)
	require.NoError(t, err)
	viewerToken, _, _ := env.auth.Login("viewer", "password123")

	resp := env.do(t, "GET", "/api/mounts", nil, jwtHeaders(viewerToken))
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// ── Mounts CRUD ───────────────────────────────────────────────────────────────

func TestAPI_Mounts_List_Empty(t *testing.T) {
	env := buildTestEnv(t)
	resp := env.do(t, "GET", "/api/mounts", nil, env.authHeaders())
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Equal(t, "[]", strings.TrimSpace(string(body)))
}

func TestAPI_Mounts_Create(t *testing.T) {
	env := buildTestEnv(t)
	resp := env.do(t, "POST", "/api/mounts",
		jsonBody(map[string]any{
			"name":            "/radio",
			"source_password": "password123",
		}),
		env.authHeaders(),
	)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	body := readJSON(t, resp.Body)
	assert.Equal(t, "/radio", body["name"])
	assert.Equal(t, "HLS", body["protocol"])
	assert.NotEmpty(t, body["id"])
}

func TestAPI_Mounts_Create_InvalidName(t *testing.T) {
	env := buildTestEnv(t)
	resp := env.do(t, "POST", "/api/mounts",
		jsonBody(map[string]any{"name": "invalid_no_slash", "source_password": "password123"}),
		env.authHeaders(),
	)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestAPI_Mounts_Create_Duplicate(t *testing.T) {
	env := buildTestEnv(t)
	body := jsonBody(map[string]any{"name": "/radio", "source_password": "password123"})
	env.do(t, "POST", "/api/mounts", body, env.authHeaders())

	body = jsonBody(map[string]any{"name": "/radio", "source_password": "password123"})
	resp := env.do(t, "POST", "/api/mounts", body, env.authHeaders())
	assert.Equal(t, http.StatusConflict, resp.StatusCode)
}

func TestAPI_Mounts_Get(t *testing.T) {
	env := buildTestEnv(t)
	env.do(t, "POST", "/api/mounts",
		jsonBody(map[string]any{"name": "/radio", "source_password": "password123"}),
		env.authHeaders(),
	)

	resp := env.do(t, "GET", "/api/mounts/radio", nil, env.authHeaders())
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	body := readJSON(t, resp.Body)
	assert.Equal(t, "/radio", body["name"])
}

func TestAPI_Mounts_Get_NotFound(t *testing.T) {
	env := buildTestEnv(t)
	resp := env.do(t, "GET", "/api/mounts/noexist", nil, env.authHeaders())
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestAPI_Mounts_Update(t *testing.T) {
	env := buildTestEnv(t)
	env.do(t, "POST", "/api/mounts",
		jsonBody(map[string]any{"name": "/radio", "source_password": "password123"}),
		env.authHeaders(),
	)

	resp := env.do(t, "PATCH", "/api/mounts/radio",
		jsonBody(map[string]any{"description": "My Radio Station", "genre": "Electronic"}),
		env.authHeaders(),
	)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	body := readJSON(t, resp.Body)
	m := body["id"] // mount is nested in response
	_ = m
	assert.Equal(t, "My Radio Station", body["description"])
	assert.Equal(t, "Electronic", body["genre"])
}

func TestAPI_Mounts_Delete(t *testing.T) {
	env := buildTestEnv(t)
	env.do(t, "POST", "/api/mounts",
		jsonBody(map[string]any{"name": "/radio", "source_password": "password123"}),
		env.authHeaders(),
	)

	resp := env.do(t, "DELETE", "/api/mounts/radio", nil, env.authHeaders())
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)

	resp = env.do(t, "GET", "/api/mounts/radio", nil, env.authHeaders())
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestAPI_Mounts_Delete_NotFound(t *testing.T) {
	env := buildTestEnv(t)
	resp := env.do(t, "DELETE", "/api/mounts/noexist", nil, env.authHeaders())
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// ── Playlists CRUD ────────────────────────────────────────────────────────────

func TestAPI_Playlists_List_Empty(t *testing.T) {
	env := buildTestEnv(t)
	resp := env.do(t, "GET", "/api/playlists", nil, env.authHeaders())
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	body, _ := io.ReadAll(resp.Body)
	assert.Equal(t, "[]", strings.TrimSpace(string(body)))
}

func TestAPI_Playlists_Create(t *testing.T) {
	env := buildTestEnv(t)
	resp := env.do(t, "POST", "/api/playlists",
		jsonBody(map[string]any{"name": "My Mix", "mode": "shuffle"}),
		env.authHeaders(),
	)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)
	body := readJSON(t, resp.Body)
	assert.Equal(t, "My Mix", body["name"])
	assert.Equal(t, "shuffle", body["mode"])
	assert.NotEmpty(t, body["id"])
}

func TestAPI_Playlists_Create_EmptyName(t *testing.T) {
	env := buildTestEnv(t)
	resp := env.do(t, "POST", "/api/playlists",
		jsonBody(map[string]any{"name": ""}),
		env.authHeaders(),
	)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestAPI_Playlists_Get(t *testing.T) {
	env := buildTestEnv(t)
	createResp := env.do(t, "POST", "/api/playlists",
		jsonBody(map[string]any{"name": "My Mix"}),
		env.authHeaders(),
	)
	created := readJSON(t, createResp.Body)
	id := created["id"].(string)

	resp := env.do(t, "GET", "/api/playlists/"+id, nil, env.authHeaders())
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	body := readJSON(t, resp.Body)
	assert.Equal(t, "My Mix", body["name"])
}

func TestAPI_Playlists_Get_NotFound(t *testing.T) {
	env := buildTestEnv(t)
	resp := env.do(t, "GET", "/api/playlists/nonexistent-id", nil, env.authHeaders())
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestAPI_Playlists_Update(t *testing.T) {
	env := buildTestEnv(t)
	createResp := env.do(t, "POST", "/api/playlists",
		jsonBody(map[string]any{"name": "Old Name"}),
		env.authHeaders(),
	)
	created := readJSON(t, createResp.Body)
	id := created["id"].(string)

	newName := "New Name"
	resp := env.do(t, "PUT", "/api/playlists/"+id,
		jsonBody(map[string]any{"name": &newName}),
		env.authHeaders(),
	)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	body := readJSON(t, resp.Body)
	assert.Equal(t, "New Name", body["name"])
}

func TestAPI_Playlists_Delete(t *testing.T) {
	env := buildTestEnv(t)
	createResp := env.do(t, "POST", "/api/playlists",
		jsonBody(map[string]any{"name": "To Delete"}),
		env.authHeaders(),
	)
	created := readJSON(t, createResp.Body)
	id := created["id"].(string)

	resp := env.do(t, "DELETE", "/api/playlists/"+id, nil, env.authHeaders())
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)

	resp = env.do(t, "GET", "/api/playlists/"+id, nil, env.authHeaders())
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// ── Library ───────────────────────────────────────────────────────────────────

func TestAPI_Library_List_Empty(t *testing.T) {
	env := buildTestEnv(t)
	resp := env.do(t, "GET", "/api/library", nil, env.authHeaders())
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// ── Users ─────────────────────────────────────────────────────────────────────

func TestAPI_Users_List_AdminOnly(t *testing.T) {
	env := buildTestEnv(t)
	env.setupAdmin(t)

	// Operator cannot list users.
	_, err := env.auth.CreateUser("op", "password123", authmanager.RoleOperator)
	require.NoError(t, err)
	opToken, _, _ := env.auth.Login("op", "password123")

	resp := env.do(t, "GET", "/api/users", nil, jwtHeaders(opToken))
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestAPI_Users_List_AsAdmin(t *testing.T) {
	env := buildTestEnv(t)
	env.setupAdmin(t)
	resp := env.do(t, "GET", "/api/users", nil, env.authHeaders())
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestAPI_Users_Create(t *testing.T) {
	env := buildTestEnv(t)
	env.setupAdmin(t)

	resp := env.do(t, "POST", "/api/users",
		jsonBody(map[string]any{
			"username": "bob",
			"password": "password123",
			"role":     "viewer",
		}),
		env.authHeaders(),
	)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	body := readJSON(t, resp.Body)
	assert.Equal(t, "bob", body["username"])
	assert.Equal(t, "viewer", body["role"])
}

func TestAPI_Users_Delete(t *testing.T) {
	env := buildTestEnv(t)
	env.setupAdmin(t)

	// Create a user to delete.
	u, err := env.auth.CreateUser("tobedeleted", "password123", authmanager.RoleViewer)
	require.NoError(t, err)

	resp := env.do(t, "DELETE", "/api/users/"+u.ID, nil, env.authHeaders())
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// ── Public endpoints (no auth) ────────────────────────────────────────────────

func TestAPI_Public_MountNotFound(t *testing.T) {
	env := buildTestEnv(t)
	resp := env.do(t, "GET", "/public/noexist", nil, nil)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestAPI_Public_MountInfo(t *testing.T) {
	env := buildTestEnv(t)
	_, err := env.mounts.Create(mount.CreateRequest{
		Name:           "/radio",
		SourcePassword: "password123",
	})
	require.NoError(t, err)

	resp := env.do(t, "GET", "/public/radio", nil, nil)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	body := readJSON(t, resp.Body)
	assert.Equal(t, "/radio", body["name"])
}

func TestAPI_Public_History(t *testing.T) {
	env := buildTestEnv(t)
	_, err := env.mounts.Create(mount.CreateRequest{
		Name:           "/radio",
		SourcePassword: "password123",
	})
	require.NoError(t, err)

	resp := env.do(t, "GET", "/public/radio/history", nil, nil)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestAPI_Public_History_MountNotFound(t *testing.T) {
	env := buildTestEnv(t)
	resp := env.do(t, "GET", "/public/noexist/history", nil, nil)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// ── Status ────────────────────────────────────────────────────────────────────

func TestAPI_Status(t *testing.T) {
	env := buildTestEnv(t)
	resp := env.do(t, "GET", "/api/status", nil, env.authHeaders())
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// ── Source: PUT /source/:mount ────────────────────────────────────────────────

func TestAPI_Source_WrongPassword(t *testing.T) {
	env := buildTestEnv(t)
	_, err := env.mounts.Create(mount.CreateRequest{
		Name:           "/radio",
		SourcePassword: "correctpassword",
	})
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPut, "/source/radio", nil)
	req.Header.Set("Authorization", "Bearer wrongpassword")
	resp, err := env.app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestAPI_Source_UnknownMount(t *testing.T) {
	env := buildTestEnv(t)
	req := httptest.NewRequest(http.MethodPut, "/source/noexist", nil)
	req.Header.Set("Authorization", "Bearer anypassword")
	resp, err := env.app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

// ── YT Import ─────────────────────────────────────────────────────────────────

func TestAPI_YTImport_ListJobs_Empty(t *testing.T) {
	env := buildTestEnv(t)
	resp := env.do(t, "GET", "/api/library/imports", nil, env.authHeaders())
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// ── Listeners ─────────────────────────────────────────────────────────────────

func TestAPI_Listeners_Empty(t *testing.T) {
	env := buildTestEnv(t)
	resp := env.do(t, "GET", "/api/listeners", nil, env.authHeaders())
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}
