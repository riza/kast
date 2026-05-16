// Package api wires together routes, middleware, and handlers.
package api

import (
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/fiber/v2/middleware/requestid"
	"github.com/riza/kast/internal/api/handler"
	"github.com/riza/kast/internal/api/middleware"
	"github.com/riza/kast/internal/api/respond"
	"github.com/riza/kast/internal/config"
	"github.com/riza/kast/internal/djmanager"
	"github.com/riza/kast/internal/hls"
	"github.com/riza/kast/internal/library"
	"github.com/riza/kast/internal/mount"
	"github.com/riza/kast/internal/playlist"
	"github.com/riza/kast/internal/source"
	"github.com/riza/kast/internal/ytimport"
)

// listenerTracker counts unique IPs actively requesting HLS content.
type listenerTracker struct {
	mu      sync.Mutex
	entries map[string]map[string]time.Time // mountName -> IP -> lastSeen
	ttl     time.Duration
}

func newListenerTracker(ttl time.Duration) *listenerTracker {
	return &listenerTracker{
		entries: make(map[string]map[string]time.Time),
		ttl:     ttl,
	}
}

func (lt *listenerTracker) touch(mountName, ip string) int {
	lt.mu.Lock()
	defer lt.mu.Unlock()
	if lt.entries[mountName] == nil {
		lt.entries[mountName] = make(map[string]time.Time)
	}
	lt.entries[mountName][ip] = time.Now()
	cutoff := time.Now().Add(-lt.ttl)
	for k, v := range lt.entries[mountName] {
		if v.Before(cutoff) {
			delete(lt.entries[mountName], k)
		}
	}
	return len(lt.entries[mountName])
}

// NewApp builds and returns the Fiber application.
func NewApp(
	cfg *config.Config,
	mounts *mount.Manager,
	scanner *library.Scanner,
	segmenter *hls.Segmenter,
	src *source.Handler,
	playlists *playlist.Manager,
	djm *djmanager.Manager,
	ytm *ytimport.Manager,
) *fiber.App {
	app := fiber.New(fiber.Config{
		AppName:               "Kast",
		DisableStartupMessage: true,
		BodyLimit:             500 * 1024 * 1024, // 500 MB for uploads
		ReadTimeout:           10 * time.Minute,
		WriteTimeout:          0,
		IdleTimeout:           120 * time.Second,
		StreamRequestBody:     true,
	})

	// ── Global middleware ────────────────────────────────────────────────────
	app.Use(recover.New())
	app.Use(requestid.New())
	app.Use(middleware.Logger())
	app.Use(middleware.SecureHeaders())
	app.Use(middleware.CORS(cfg.Server.CORSOrigins))

	// ── HLS streaming — unauthenticated, high-volume ─────────────────────────
	listenerTrack := newListenerTracker(30 * time.Second)
	app.Get("/hls/:mount/*", limiter.New(limiter.Config{
		Max:        300,
		Expiration: time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
	}), func(c *fiber.Ctx) error {
		mountName := c.Params("mount")

		ip := c.IP()
		if host, _, err := net.SplitHostPort(ip); err == nil {
			ip = host
		}
		count := listenerTrack.touch("/"+mountName, ip)
		mounts.SetListeners("/"+mountName, count)

		dir := segmenter.MountDir(mountName)
		filePath := c.Params("*")
		fullPath := filepath.Join(dir, filepath.Clean("/"+filePath))

		// ── LL-HLS blocking playlist reload ─────────────────────────────────
		// When a client sends ?_HLS_msn=X&_HLS_part=Y we must hold the request
		// open until that part has been written to disk, then serve the playlist.
		if filePath == "index.m3u8" {
			msnStr := c.Query("_HLS_msn")
			partStr := c.Query("_HLS_part")
			if msnStr != "" && partStr != "" {
				t := djm.Trackers.Get(dir)
				if t != nil {
					wantMSN, errMSN := parseInt(msnStr)
					wantPart, errPart := parseInt(partStr)
					if errMSN == nil && errPart == nil {
						t.WaitFor(wantMSN, wantPart)
					}
				}
			}
		}

		if _, err := os.Stat(fullPath); err != nil {
			return c.SendStatus(fiber.StatusNotFound)
		}
		c.Set("Cache-Control", "no-cache")

		// Inject LL-HLS server control header into playlist responses.
		if filePath == "index.m3u8" {
			if mt, err := mounts.Get("/" + mountName); err == nil && mt.Protocol == "LL-HLS" {
				return servePlaylistWithLLHeaders(c, fullPath)
			}
		}

		return c.SendFile(fullPath, false)
	})

	// ── Public endpoints — no auth ───────────────────────────────────────────
	pub := app.Group("", func(c *fiber.Ctx) error {
		c.Set("Access-Control-Allow-Origin", "*")
		c.Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		if c.Method() == fiber.MethodOptions {
			return c.SendStatus(fiber.StatusNoContent)
		}
		return c.Next()
	})

	ph := &handler.Player{Manager: mounts}
	pub.Get("/player/:mount", ph.ServeHTTP)

	pub.Get("/public/:mount", func(c *fiber.Ctx) error {
		mountName := "/" + c.Params("mount")
		mt, err := mounts.Get(mountName)
		if err != nil {
			return respond.Error(c, fiber.StatusNotFound, "mount not found")
		}
		t := djm.NowPlaying(mountName)
		type nowPlayingInfo struct {
			Title      string `json:"title"`
			Artist     string `json:"artist"`
			Album      string `json:"album"`
			DurationMs int64  `json:"duration_ms"`
		}
		type publicMount struct {
			Name        string          `json:"name"`
			Description string          `json:"description"`
			Genre       string          `json:"genre"`
			Website     string          `json:"website"`
			Protocol    string          `json:"protocol"`
			Codec       string          `json:"codec"`
			Bitrate     string          `json:"bitrate"`
			Status      string          `json:"status"`
			Listeners   int             `json:"listeners"`
			NowPlaying  *nowPlayingInfo `json:"now_playing"`
			// Player config
			PlayerStationName  string `json:"player_station_name"`
			PlayerAccent       string `json:"player_accent"`
			PlayerAccentSoft   string `json:"player_accent_soft"`
			PlayerTheme        string `json:"player_theme"`
			PlayerLayout       string `json:"player_layout"`
			PlayerAmbient      bool   `json:"player_ambient"`
			PlayerShowAbout    bool   `json:"player_show_about"`
			PlayerShowHistory  bool   `json:"player_show_history"`
			PlayerShowPlaylist bool   `json:"player_show_playlist"`
		}
		resp := publicMount{
			Name:               mt.Name,
			Description:        mt.Description,
			Genre:              mt.Genre,
			Website:            mt.Website,
			Protocol:           mt.Protocol,
			Codec:              mt.Codec,
			Bitrate:            mt.Bitrate,
			Status:             string(mt.Status),
			Listeners:          mt.Listeners,
			PlayerStationName:  mt.PlayerStationName,
			PlayerAccent:       mt.PlayerAccent,
			PlayerAccentSoft:   mt.PlayerAccentSoft,
			PlayerTheme:        mt.PlayerTheme,
			PlayerLayout:       mt.PlayerLayout,
			PlayerAmbient:      mt.PlayerAmbient,
			PlayerShowAbout:    mt.PlayerShowAbout,
			PlayerShowHistory:  mt.PlayerShowHistory,
			PlayerShowPlaylist: mt.PlayerShowPlaylist,
		}
		if t != nil {
			resp.NowPlaying = &nowPlayingInfo{
				Title:      t.Title,
				Artist:     t.Artist,
				Album:      t.Album,
				DurationMs: t.DurationMs,
			}
		}
		return respond.OK(c, resp)
	})

	pub.Get("/public/:mount/history", func(c *fiber.Ctx) error {
		mountName := "/" + c.Params("mount")
		if _, err := mounts.Get(mountName); err != nil {
			return respond.Error(c, fiber.StatusNotFound, "mount not found")
		}
		tracks := djm.RecentTracks(mountName)
		type trackInfo struct {
			Title      string `json:"title"`
			Artist     string `json:"artist"`
			Album      string `json:"album"`
			DurationMs int64  `json:"duration_ms"`
		}
		out := make([]trackInfo, 0, len(tracks))
		for _, t := range tracks {
			out = append(out, trackInfo{Title: t.Title, Artist: t.Artist, Album: t.Album, DurationMs: t.DurationMs})
		}
		return respond.OK(c, out)
	})

	pub.Get("/public/:mount/playlist", func(c *fiber.Ctx) error {
		mountName := "/" + c.Params("mount")
		if _, err := mounts.Get(mountName); err != nil {
			return respond.Error(c, fiber.StatusNotFound, "mount not found")
		}
		sess := djm.GetSession(mountName)
		if sess == nil {
			return respond.OK(c, []struct{}{})
		}
		pl, err := playlists.Get(sess.PlaylistID)
		if err != nil {
			return respond.OK(c, []struct{}{})
		}
		allTracks := scanner.Tracks()
		byPath := make(map[string]struct {
			Title, Artist, Album string
			DurationMs           int64
		}, len(allTracks))
		for _, t := range allTracks {
			byPath[t.Path] = struct {
				Title, Artist, Album string
				DurationMs           int64
			}{t.Title, t.Artist, t.Album, t.DurationMs}
		}
		type trackInfo struct {
			Title      string `json:"title"`
			Artist     string `json:"artist"`
			Album      string `json:"album"`
			DurationMs int64  `json:"duration_ms"`
		}
		out := make([]trackInfo, 0, len(pl.TrackPaths))
		for _, path := range pl.TrackPaths {
			if t, ok := byPath[path]; ok {
				out = append(out, trackInfo{Title: t.Title, Artist: t.Artist, Album: t.Album, DurationMs: t.DurationMs})
			}
		}
		type playlistResp struct {
			Name   string      `json:"name"`
			Mode   string      `json:"mode"`
			Tracks []trackInfo `json:"tracks"`
		}
		return respond.OK(c, playlistResp{Name: pl.Name, Mode: pl.Mode, Tracks: out})
	})

	// ── Source input — authenticated PUT ────────────────────────────────────
	app.Put("/source/:mount", func(c *fiber.Ctx) error {
		mountName := "/" + c.Params("mount")
		pwd := extractBearer(c)
		if !mounts.VerifySourcePassword(mountName, pwd) {
			c.Set("WWW-Authenticate", `Bearer realm="kast-source"`)
			return c.Status(fiber.StatusUnauthorized).SendString("unauthorized")
		}
		// Adapt Fiber context to net/http for the source handler (streaming body).
		src.ServeHTTPFiber(c, mountName)
		return nil
	})

	// ── Admin API — Bearer token required ───────────────────────────────────
	api := app.Group("/api", limiter.New(limiter.Config{
		Max:        200,
		Expiration: time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
	}), middleware.BearerAuth(cfg.Admin.APIKey))

	mh := &handler.Mounts{Manager: mounts}
	lh := &handler.Library{Scanner: scanner, UploadDir: scanner.PrimaryUploadDir()}
	plh := &handler.Playlists{Manager: playlists}
	djh  := &handler.AutoDJ{DJManager: djm, Playlists: playlists, Scanner: scanner}
	whep := &handler.WHEP{Manager: djm.WebRTC}
	yth  := &handler.YTImport{Manager: ytm}

	api.Get("/status", handler.Status)

	api.Get("/mounts", mh.List)
	api.Post("/mounts", mh.Create)
	api.Get("/mounts/:name", mh.Get)
	api.Delete("/mounts/:name", mh.Delete)
	api.Put("/mounts/:name/player", func(c *fiber.Ctx) error {
		mountName := "/" + c.Params("name")
		var cfg mount.PlayerConfigUpdate
		if err := c.BodyParser(&cfg); err != nil {
			return respond.Error(c, fiber.StatusBadRequest, "invalid JSON")
		}
		if err := mounts.UpdatePlayerConfig(mountName, cfg); err != nil {
			return respond.Error(c, fiber.StatusNotFound, "mount not found")
		}
		return respond.OK(c, fiber.Map{"status": "ok"})
	})
	api.Post("/mounts/:name/autodj", djh.Start)
	api.Get("/mounts/:name/autodj", djh.Status)
	api.Delete("/mounts/:name/autodj", djh.Stop)
	api.Post("/mounts/:name/autodj/skip", djh.Skip)
	api.Get("/mounts/:name/nowplaying", djh.NowPlaying)
	api.Get("/autodj/sessions", djh.Sessions)

	// WHEP: WebRTC HTTP Egress — POST SDP offer, receive SDP answer.
	// No auth required (same as HLS segments — public stream).
	app.Post("/whep/:name", whep.Offer)
	app.Options("/whep/:name", func(c *fiber.Ctx) error {
		c.Set("Access-Control-Allow-Origin", "*")
		c.Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		c.Set("Access-Control-Allow-Headers", "Content-Type")
		return c.SendStatus(fiber.StatusNoContent)
	})

	api.Get("/library", lh.List)
	api.Post("/library/scan", lh.Scan)
	api.Post("/library/upload", lh.Upload)
	api.Post("/library/import/youtube/preview", yth.Preview)
	api.Post("/library/import/youtube", yth.Start)
	api.Get("/library/imports", yth.ListJobs)
	api.Get("/library/imports/:id", yth.GetJob)

	api.Get("/playlists", plh.List)
	api.Post("/playlists", plh.Create)
	api.Get("/playlists/:id", plh.Get)
	api.Put("/playlists/:id", plh.Update)
	api.Delete("/playlists/:id", plh.Delete)

	return app
}

// extractBearer pulls the token from "Authorization: Bearer <token>".
func extractBearer(c *fiber.Ctx) string {
	v := c.Get("Authorization")
	if len(v) > 7 && v[:7] == "Bearer " {
		return v[7:]
	}
	return ""
}

func parseInt(s string) (int, error) {
	n := 0
	for _, ch := range s {
		if ch < '0' || ch > '9' {
			return 0, fmt.Errorf("not a number")
		}
		n = n*10 + int(ch-'0')
	}
	return n, nil
}

// servePlaylistWithLLHeaders reads an HLS playlist file, injects the
// EXT-X-SERVER-CONTROL tag required for LL-HLS blocking reload (if not
// already present), and writes the result to the response.
func servePlaylistWithLLHeaders(c *fiber.Ctx, path string) error {
	data, err := os.ReadFile(filepath.Clean(path))
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}

	const serverControl = "#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=0.6\n"
	body := string(data)

	if !contains(body, "#EXT-X-SERVER-CONTROL") {
		// Insert after the #EXTM3U line.
		body = strings.Replace(body, "#EXTM3U\n", "#EXTM3U\n"+serverControl, 1)
	}

	c.Set("Content-Type", "application/vnd.apple.mpegurl")
	c.Set("Cache-Control", "no-cache")
	return c.SendString(body)
}

func contains(s, substr string) bool {
	return strings.Contains(s, substr)
}
