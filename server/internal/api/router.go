// Package api wires together routes, middleware, and handlers.
package api

import (
	"encoding/base64"
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
	"github.com/phuslu/iploc"
	"github.com/riza/kast/internal/api/handler"
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

// listenerTracker counts unique IPs actively requesting HLS content.
type listenerTracker struct {
	mu      sync.Mutex
	entries map[string]map[string]listenerData // mountName -> IP -> data
	ttl     time.Duration
}

type listenerData struct {
	lastSeen  time.Time
	userAgent string
}

func newListenerTracker(ttl time.Duration) *listenerTracker {
	return &listenerTracker{
		entries: make(map[string]map[string]listenerData),
		ttl:     ttl,
	}
}

func (lt *listenerTracker) touch(mountName, ip, userAgent string) int {
	lt.mu.Lock()
	defer lt.mu.Unlock()
	if lt.entries[mountName] == nil {
		lt.entries[mountName] = make(map[string]listenerData)
	}
	lt.entries[mountName][ip] = listenerData{lastSeen: time.Now(), userAgent: userAgent}
	cutoff := time.Now().Add(-lt.ttl)
	for k, v := range lt.entries[mountName] {
		if v.lastSeen.Before(cutoff) {
			delete(lt.entries[mountName], k)
		}
	}
	return len(lt.entries[mountName])
}

type listenerEntry struct {
	IP          string    `json:"ip"`
	Mount       string    `json:"mount"`
	LastSeen    time.Time `json:"last_seen"`
	CountryCode string    `json:"country_code"`
	UserAgent   string    `json:"user_agent"`
}

// all returns every active listener across all mounts, expiring stale entries.
func (lt *listenerTracker) all() []listenerEntry {
	lt.mu.Lock()
	defer lt.mu.Unlock()
	cutoff := time.Now().Add(-lt.ttl)
	var out []listenerEntry
	for mount, ips := range lt.entries {
		for ip, d := range ips {
			if d.lastSeen.Before(cutoff) {
				delete(ips, ip)
				continue
			}
			e := listenerEntry{IP: ip, Mount: mount, LastSeen: d.lastSeen, UserAgent: d.userAgent}
			if parsed := net.ParseIP(ip); parsed != nil {
				e.CountryCode = iploc.Country(parsed)
			}
			out = append(out, e)
		}
	}
	return out
}

// sweep expires stale entries and returns a map of mountName → current count.
func (lt *listenerTracker) sweep() map[string]int {
	lt.mu.Lock()
	defer lt.mu.Unlock()
	cutoff := time.Now().Add(-lt.ttl)
	counts := make(map[string]int, len(lt.entries))
	for mount, ips := range lt.entries {
		for k, v := range ips {
			if v.lastSeen.Before(cutoff) {
				delete(ips, k)
			}
		}
		counts[mount] = len(ips)
	}
	return counts
}

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
) *fiber.App {
	fiberCfg := fiber.Config{
		AppName:               "Kast",
		DisableStartupMessage: true,
		BodyLimit:             500 * 1024 * 1024, // 500 MB for uploads
		ReadTimeout:           10 * time.Minute,
		WriteTimeout:          0,
		IdleTimeout:           120 * time.Second,
		StreamRequestBody:     true,
	}
	if cfg.Server.TrustProxy {
		// When running behind a reverse proxy (nginx, Caddy, Traefik, etc.),
		// use the X-Forwarded-For header for the real client IP instead of
		// the Docker gateway IP seen on the raw connection.
		fiberCfg.ProxyHeader = fiber.HeaderXForwardedFor
	}
	app := fiber.New(fiberCfg)

	// ── Global middleware ────────────────────────────────────────────────────
	app.Use(recover.New())
	app.Use(requestid.New())
	app.Use(middleware.Logger())
	app.Use(middleware.SecureHeaders())
	app.Use(middleware.CORS(cfg.Server.CORSOrigins))

	// ── HLS streaming — unauthenticated, high-volume ─────────────────────────
	listenerTrack := newListenerTracker(30 * time.Second)

	// Background sweep: expire stale entries and push counts to every mount.
	// Iterating all mounts (not just those in the tracker) ensures a mount
	// with no recent requests gets written as 0, not left at a stale value.
	prevCounts := make(map[string]int)
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			counts := listenerTrack.sweep()
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
		Max:        300,
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
			ip := c.IP()
			if host, _, err := net.SplitHostPort(ip); err == nil {
				ip = host
			}
			// With TrustProxy on, c.IP() returns whatever's in the first
			// X-Forwarded-For segment — scanners and bad proxies inject
			// non-IP junk (JSON fragments, scheme strings, country codes).
			// Skip the bookkeeping when the value isn't a real IP.
			if net.ParseIP(ip) != nil {
				count := listenerTrack.touch("/"+mountName, ip, c.Get("User-Agent"))
				mounts.SetListeners("/"+mountName, count)
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
		Max:        10,
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
		Max:        200,
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
	sh   := &handler.Settings{Cfg: cfg, ConfigPath: configPath}
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
		entries := listenerTrack.all()
		if entries == nil {
			entries = []listenerEntry{}
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
