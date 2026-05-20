// Package api wires together routes, middleware, and handlers.
package api

import (
	"encoding/base64"
	"fmt"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/fiber/v2/middleware/requestid"
	"github.com/riza/kast/internal/api/handler"
	"github.com/riza/kast/internal/api/hlsutil"
	"github.com/riza/kast/internal/api/listener"
	"github.com/riza/kast/internal/api/middleware"
	"github.com/riza/kast/internal/api/respond"
	"github.com/riza/kast/internal/apikey"
	"github.com/riza/kast/internal/authmanager"
	"github.com/riza/kast/internal/config"
	"github.com/riza/kast/internal/djmanager"
	"github.com/riza/kast/internal/hls"
	"github.com/riza/kast/internal/library"
	"github.com/riza/kast/internal/livesource"
	"github.com/riza/kast/internal/mount"
	"github.com/riza/kast/internal/playlist"
	"github.com/riza/kast/internal/schedule"
	"github.com/riza/kast/internal/source"
	"github.com/riza/kast/internal/webhook"
	"github.com/riza/kast/internal/ytimport"
)


const (
	maxUploadBytes = 500 << 20        // 500 MB multipart upload limit
	listenerTTL    = 30 * time.Second // HLS listener sliding window
	sweepInterval  = 5 * time.Second  // listener count refresh rate
	hlsRateLimit   = 300              // max HLS requests per IP per minute
	apiRateLimit   = 200              // max API requests per IP per minute
	loginRateLimit = 10               // max login attempts per IP per minute
)

// NewApp builds and returns the Fiber application.
func NewApp(
	cfg *config.Config,
	configPath string,
	auth *authmanager.Manager,
	mounts *mount.Manager,
	scanner *library.Scanner,
	segmenter *hls.Segmenter,
	src *source.Handler,
	playlists *playlist.Manager,
	djm *djmanager.Manager,
	ytm *ytimport.Manager,
	webhooks *webhook.Manager,
	lsm *livesource.Manager,
	schedules *schedule.Manager,
	keys *apikey.Manager,
	logLevel *slog.LevelVar,
) *fiber.App {
	fiberCfg := fiber.Config{
		AppName:               "Kast",
		DisableStartupMessage: true,
		BodyLimit:             maxUploadBytes,
		ReadTimeout:           10 * time.Minute,
		WriteTimeout:          0,
		IdleTimeout:           120 * time.Second,
		StreamRequestBody:     true,
	}
	if cfg.Server.TrustProxy {
		// When running behind a reverse proxy, use the configured proxy header
		// for the real client IP. Defaults to X-Forwarded-For; set to
		// CF-Connecting-IP for Cloudflare setups to avoid spoofed XFF values.
		fiberCfg.ProxyHeader = cfg.Server.ProxyHeader
		// EnableIPValidation makes Fiber parse comma-separated values in the
		// proxy header and skip any token that is not a valid IP address.
		// Without this, c.IP() returns the raw header string verbatim (even if
		// it contains non-IP garbage like country codes or JSON fragments).
		fiberCfg.EnableIPValidation = true
	}
	app := fiber.New(fiberCfg)

	// ── Global middleware ────────────────────────────────────────────────────
	app.Use(recover.New())
	app.Use(requestid.New())
	app.Use(middleware.Logger())
	app.Use(middleware.SecureHeaders())
	app.Use(middleware.CORS(cfg.Server.CORSOrigins))

	// ── HLS streaming — unauthenticated, high-volume ─────────────────────────
	listenerTrack := listener.New(listenerTTL)

	// Background sweep: expire stale entries and push counts to every mount.
	// Iterating all mounts (not just those in the tracker) ensures a mount
	// with no recent requests gets written as 0, not left at a stale value.
	prevCounts := make(map[string]int)
	go func() {
		ticker := time.NewTicker(sweepInterval)
		defer ticker.Stop()
		for range ticker.C {
			counts := listenerTrack.Sweep()
			for _, mt := range mounts.List() {
				n := counts[mt.Name]
				mounts.SetListeners(mt.Name, n)
				if webhooks != nil && n != prevCounts[mt.Name] {
					prevCounts[mt.Name] = n
					webhooks.Emit("listener.count.changed", map[string]any{
						"mount":     mt.Name,
						"listeners": n,
					})
				}
			}
		}
	}()

	app.Get("/hls/:mount/*", limiter.New(limiter.Config{
		Max:        hlsRateLimit,
		Expiration: time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
	}), func(c *fiber.Ctx) error {
		mountName := c.Params("mount")

		dir := segmenter.MountDir(mountName)
		filePath := c.Params("*")

		// Only count segment requests as listeners — not playlist polls.
		// Playlist files are fetched immediately on page load and frequently
		// during playback; segments are only fetched by clients actively playing.
		if filePath != "index.m3u8" && filePath != "init.mp4" {
			rawIP := c.IP()
			xff := c.Get("X-Forwarded-For")
			ip := rawIP
			if host, _, err := net.SplitHostPort(ip); err == nil {
				ip = host
			}
			// With TrustProxy on, c.IP() returns whatever's in the first
			// X-Forwarded-For segment — scanners and bad proxies inject
			// non-IP junk (JSON fragments, scheme strings, country codes).
			// Skip the bookkeeping when the value isn't a real IP.
			if net.ParseIP(ip) != nil {
				count, keys := listenerTrack.TouchDebug("/"+mountName, ip, c.Get("User-Agent"))
				mounts.SetListeners("/"+mountName, count)
				slog.Debug("hls: listener touch",
					"mount", mountName,
					"ip", ip,
					"raw_ip", rawIP,
					"xff", xff,
					"file", filePath,
					"listeners", count,
					"map_keys", fmt.Sprintf("%q", keys),
					"user_agent", c.Get("User-Agent"),
				)
			} else {
				slog.Debug("hls: rejected non-IP",
					"mount", mountName,
					"raw_ip", rawIP,
					"xff", xff,
					"file", filePath,
				)
			}
		}
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
					wantMSN, errMSN := hlsutil.ParseInt(msnStr)
					wantPart, errPart := hlsutil.ParseInt(partStr)
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
				return hlsutil.ServePlaylistWithLLHeaders(c, fullPath)
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

	pubh := &handler.Public{Mounts: mounts, DJManager: djm, Playlists: playlists, Scanner: scanner}
	pub.Get("/public/:mount", pubh.Mount)
	pub.Get("/public/:mount/history", pubh.History)
	pub.Get("/public/:mount/playlist", pubh.Playlist)

	// ── Source input — authenticated PUT ────────────────────────────────────
	app.Put("/source/:mount", func(c *fiber.Ctx) error {
		mountName := "/" + c.Params("mount")
		pwd := extractBearer(c)
		if !mounts.VerifySourcePassword(mountName, pwd) {
			c.Set("WWW-Authenticate", `Bearer realm="kast-source"`)
			return c.Status(fiber.StatusUnauthorized).SendString("unauthorized")
		}
		if err := lsm.Connect(mountName); err != nil {
			return c.Status(fiber.StatusConflict).SendString(err.Error())
		}
		defer lsm.Disconnect(mountName)
		src.ServeHTTPFiber(c, mountName)
		return nil
	})

	// ── Global IP allowlist for /api/* (empty = allow all) ──────────────────
	if len(cfg.Server.AdminAllowlist) > 0 {
		app.Use("/api", middleware.IPAllowlist(cfg.Server.AdminAllowlist))
	}

	// ── Auth endpoints — public ─────────────────────────────────────────────
	authH := &handler.Auth{
		Manager:       auth,
		SecureCookies: cfg.SSL.Enabled || cfg.Admin.SecureCookies,
	}
	loginLimiter := limiter.New(limiter.Config{
		Max:        loginRateLimit,
		Expiration: time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
	})
	app.Get("/api/auth/setup", authH.SetupStatus)
	app.Post("/api/auth/setup", authH.Setup)
	app.Post("/api/auth/login", loginLimiter, authH.Login)
	app.Post("/api/auth/logout", authH.Logout)

	// ── Admin API — Bearer token required ───────────────────────────────────
	api := app.Group("/api", limiter.New(limiter.Config{
		Max:        apiRateLimit,
		Expiration: time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
	}), middleware.BearerAuth(keys, auth))

	api.Get("/auth/me", authH.Me)

	// User management — admin only
	uh := &handler.Users{Manager: auth}
	adminOnly := middleware.RequireRole(authmanager.RoleAdmin)
	api.Get("/users", adminOnly, uh.List)
	api.Post("/users", adminOnly, uh.Create)
	api.Put("/users/:id", adminOnly, uh.Update)
	api.Delete("/users/:id", adminOnly, uh.Delete)

	mh   := &handler.Mounts{Manager: mounts, DJManager: djm, Webhooks: webhooks}
	lh   := &handler.Library{Scanner: scanner, UploadDir: scanner.PrimaryUploadDir()}
	plh  := &handler.Playlists{Manager: playlists, Webhooks: webhooks}
	djh  := &handler.AutoDJ{DJManager: djm, Playlists: playlists, Scanner: scanner, Webhooks: webhooks}
	sh   := &handler.Settings{Cfg: cfg, ConfigPath: configPath, LogLevel: logLevel}
	svh  := &handler.Server{ConfigPath: configPath, DataDir: "./data"}
	whep := &handler.WHEP{Manager: djm.WebRTC}
	yth  := &handler.YTImport{Manager: ytm}
	whh  := &handler.Webhooks{Manager: webhooks}
	sch  := &handler.Schedules{Manager: schedules, Webhooks: webhooks}

	api.Get("/status", handler.Status)
	api.Get("/settings", adminOnly, sh.Get)
	api.Patch("/settings", adminOnly, sh.Update)
	api.Post("/server/restart", adminOnly, svh.Restart)
	api.Delete("/server/reset", adminOnly, svh.FactoryReset)

	api.Get("/listeners", func(c *fiber.Ctx) error {
		entries := listenerTrack.All()
		if entries == nil {
			entries = []listener.Entry{}
		}
		return respond.OK(c, entries)
	})


	api.Get("/mounts", mh.List)
	api.Post("/mounts", mh.Create)
	api.Get("/mounts/:name", mh.Get)
	api.Patch("/mounts/:name", mh.Update)
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
	api.Put("/mounts/:name/jingles", func(c *fiber.Ctx) error {
		mountName := "/" + c.Params("name")
		var cfg mount.JingleConfigUpdate
		if err := c.BodyParser(&cfg); err != nil {
			return respond.Error(c, fiber.StatusBadRequest, "invalid JSON")
		}
		if err := mounts.UpdateJingleConfig(mountName, cfg); err != nil {
			return respond.Error(c, fiber.StatusNotFound, "mount not found")
		}
		return respond.OK(c, fiber.Map{"status": "ok"})
	})
	api.Post("/mounts/:name/autodj", djh.Start)
	api.Get("/mounts/:name/autodj", djh.Status)
	api.Delete("/mounts/:name/autodj", djh.Stop)
	api.Post("/mounts/:name/autodj/skip", djh.Skip)
	api.Get("/mounts/:name/autodj/tracks", djh.Tracks)
	api.Post("/mounts/:name/autodj/jump", djh.JumpTo)
	api.Post("/mounts/:name/autodj/queue", djh.InsertNext)
	api.Get("/mounts/:name/autodj/history", djh.History)
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
	api.Patch("/library/:id", lh.Update)
	api.Delete("/library/:id/override", lh.ResetOverride)
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

	api.Get("/webhooks", adminOnly, whh.List)
	api.Post("/webhooks", adminOnly, whh.Create)
	api.Get("/webhooks/:id", adminOnly, whh.Get)
	api.Patch("/webhooks/:id", adminOnly, whh.Update)
	api.Delete("/webhooks/:id", adminOnly, whh.Delete)

	akh := &handler.APIKeys{Manager: keys}
	api.Get("/apikeys", adminOnly, akh.List)
	api.Post("/apikeys", adminOnly, akh.Create)
	api.Patch("/apikeys/:id", adminOnly, akh.Update)
	api.Delete("/apikeys/:id", adminOnly, akh.Delete)

	api.Get("/schedules", adminOnly, sch.List)
	api.Post("/schedules", adminOnly, sch.Create)
	api.Get("/schedules/:id", adminOnly, sch.Get)
	api.Patch("/schedules/:id", adminOnly, sch.Update)
	api.Delete("/schedules/:id", adminOnly, sch.Delete)

	return app
}

// extractBearer pulls the source password from the Authorization header.
// Accepts both Bearer (curl, ffmpeg, liquidsoap) and Basic (OBS, BUTT, Mixxx)
// auth schemes. For Basic, the password field is used as the source password.
func extractBearer(c *fiber.Ctx) string {
	v := c.Get("Authorization")
	if strings.HasPrefix(v, "Bearer ") {
		return v[7:]
	}
	if strings.HasPrefix(v, "Basic ") {
		decoded, err := base64.StdEncoding.DecodeString(v[6:])
		if err == nil {
			if _, pwd, ok := strings.Cut(string(decoded), ":"); ok {
				return pwd
			}
		}
	}
	return ""
}

