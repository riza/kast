package main

import (
	"context"
	"crypto/tls"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"golang.org/x/crypto/acme/autocert"

	"github.com/gofiber/fiber/v2"
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
	"github.com/riza/kast/internal/webhook"
	"github.com/riza/kast/internal/webrtcmanager"
	"github.com/riza/kast/internal/ytimport"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "kast: %v\n", err)
		os.Exit(1)
	}
}

const banner = ` __                     __
|  | _______    _______/  |_
|  |/ /\__  \  /  ___/\   __\
|    <  / __ \_\___ \  |  |
|__|_ \(____  /____  > |__|
     \/     \/     \/
`

func run() error {
	fmt.Print(banner)

	cfgPath := flag.String("config", "kast.toml", "path to TOML configuration file")
	flag.Parse()

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		return err
	}

	setupLogger(cfg.Log.Level, cfg.Log.Format)
	slog.Info("kast starting", "version", "0.1.0")

	// ── Storage directories ──────────────────────────────────────────────────
	dataDir := "./data"

	// ── Database ─────────────────────────────────────────────────────────────
	database, err := db.Open(filepath.Join(dataDir, "kast.db"))
	if err != nil {
		return fmt.Errorf("database: %w", err)
	}
	defer database.Close()

	auth := authmanager.New(database, cfg.Admin.JWTSecret)

	// ── Core services ────────────────────────────────────────────────────────
	mounts, err := mount.NewManager(database)
	if err != nil {
		return fmt.Errorf("mount manager: %w", err)
	}

	scanner, err := library.NewScanner(
		cfg.Library.ScanDirs,
		cfg.Library.AudioExtensions,
		database,
	)
	if err != nil {
		return fmt.Errorf("library scanner: %w", err)
	}

	segmenter, err := hls.NewSegmenter(
		cfg.HLS.OutputDir,
		cfg.HLS.SegmentDuration,
		cfg.HLS.PlaylistSize,
	)
	if err != nil {
		return fmt.Errorf("hls segmenter: %w", err)
	}

	src := source.NewHandler()

	playlists, err := playlist.NewManager(database)
	if err != nil {
		return fmt.Errorf("playlist manager: %w", err)
	}

	webhooks, err := webhook.NewManager(database)
	if err != nil {
		return fmt.Errorf("webhook manager: %w", err)
	}

	djm := djmanager.NewManager(segmenter, mounts, database, playlists, scanner, webrtcmanager.Config{
		NATIPs:     cfg.WebRTC.NATIPs,
		UDPPortMin: cfg.WebRTC.UDPPortMin,
		UDPPortMax: cfg.WebRTC.UDPPortMax,
	}, webhooks)

	importDir := "./data/music"
	if len(cfg.Library.ScanDirs) > 0 {
		importDir = cfg.Library.ScanDirs[0]
	}
	ytm := ytimport.NewManager(importDir, scanner)

	lsm := livesource.NewManager(segmenter, mounts, src, webhooks)

	schedules, err := schedule.NewManager(database, mounts, playlists)
	if err != nil {
		return fmt.Errorf("schedule manager: %w", err)
	}
	scheduleRunner := schedule.NewRunner(schedules, djm, playlists, scanner, webhooks, cfg.Server.Timezone)

	keys, err := apikey.NewManager(database)
	if err != nil {
		return fmt.Errorf("apikey manager: %w", err)
	}

	// ── Fiber app ────────────────────────────────────────────────────────────
	app := api.NewApp(cfg, *cfgPath, auth, mounts, scanner, segmenter, src, playlists, djm, ytm, webhooks, lsm, schedules, keys)

	// rootCtx scopes long-lived background tasks (scheduler runner) so they
	// stop cleanly before djm.StopAll() runs.
	rootCtx, rootCancel := context.WithCancel(context.Background())
	defer rootCancel()

	// ── Initial library scan + AutoDJ restore + scheduler (background) ───────
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		if err := scanner.Scan(ctx); err != nil {
			slog.Error("initial library scan", "err", err)
		}
		// Restore AutoDJ sessions that were active before the last shutdown.
		// Runs after the scan so that track data is available.
		djm.Restore(context.Background())
		// Start the schedule runner only after Restore so the first tick sees
		// the real session state and can adopt existing sessions rather than
		// fighting them.
		go scheduleRunner.Run(rootCtx)
	}()

	// ── Start servers ────────────────────────────────────────────────────────
	errCh := make(chan error, 2)

	if cfg.SSL.Enabled {
		// HTTPS is the primary listener; HTTP redirects to HTTPS.
		go func() {
			if err := startTLS(app, cfg); err != nil {
				errCh <- fmt.Errorf("tls: %w", err)
			}
		}()
		go startHTTPRedirect(cfg.Server.HTTPAddr, cfg.SSL.Domains)
	} else {
		go func() {
			slog.Info("http server listening", "addr", cfg.Server.HTTPAddr)
			if err := app.Listen(cfg.Server.HTTPAddr); err != nil {
				errCh <- fmt.Errorf("http: %w", err)
			}
		}()
	}

	// ── Graceful shutdown ────────────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-quit:
		slog.Info("shutting down", "signal", sig)
	case err := <-errCh:
		return err
	}

	if err := app.ShutdownWithTimeout(30 * time.Second); err != nil {
		slog.Error("shutdown error", "err", err)
	}
	// Stop scheduler before djm so it doesn't try to start a session against
	// a tearing-down segmenter.
	rootCancel()
	djm.StopAll()
	lsm.StopAll()
	slog.Info("kast stopped")
	return nil
}

// startTLS starts the HTTPS listener with either auto-cert (Let's Encrypt) or
// manual certificate files.
func startTLS(app *fiber.App, cfg *config.Config) error {
	if cfg.SSL.AutoCert {
		return startAutoCert(app, cfg)
	}
	slog.Info("https server listening", "addr", cfg.SSL.HTTPAddr, "cert", cfg.SSL.CertFile)
	return app.ListenTLS(cfg.SSL.HTTPAddr, cfg.SSL.CertFile, cfg.SSL.KeyFile)
}

// startAutoCert configures Let's Encrypt automatic certificate management.
func startAutoCert(app *fiber.App, cfg *config.Config) error {
	if err := os.MkdirAll(cfg.SSL.CertDir, 0o700); err != nil {
		return fmt.Errorf("create cert dir: %w", err)
	}

	m := &autocert.Manager{
		Prompt:     autocert.AcceptTOS,
		HostPolicy: autocert.HostWhitelist(cfg.SSL.Domains...),
		Cache:      autocert.DirCache(cfg.SSL.CertDir),
	}

	tlsCfg := &tls.Config{
		GetCertificate: m.GetCertificate,
		NextProtos:     []string{"h2", "http/1.1", "acme-tls/1"},
		MinVersion:     tls.VersionTLS12,
	}

	ln, err := tls.Listen("tcp", cfg.SSL.HTTPAddr, tlsCfg)
	if err != nil {
		return fmt.Errorf("tls listen: %w", err)
	}

	slog.Info("https server listening (auto-cert)",
		"addr", cfg.SSL.HTTPAddr,
		"domains", cfg.SSL.Domains,
	)

	return app.Listener(ln)
}

// startHTTPRedirect starts a minimal Fiber app that redirects all HTTP traffic
// to HTTPS. It also handles ACME HTTP-01 challenges via autocert.
func startHTTPRedirect(addr string, domains []string) {
	redirect := fiber.New(fiber.Config{DisableStartupMessage: true})
	redirect.All("/*", func(c *fiber.Ctx) error {
		host := c.Hostname()
		return c.Redirect("https://"+host+c.OriginalURL(), fiber.StatusMovedPermanently)
	})
	slog.Info("http→https redirect listening", "addr", addr)
	if err := redirect.Listen(addr); err != nil {
		slog.Error("http redirect server failed", "err", err)
	}
}

func setupLogger(level, format string) {
	var lvl slog.Level
	switch level {
	case "debug":
		lvl = slog.LevelDebug
	case "warn":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}
	opts := &slog.HandlerOptions{Level: lvl}
	var h slog.Handler
	if format == "json" {
		h = slog.NewJSONHandler(os.Stdout, opts)
	} else {
		h = slog.NewTextHandler(os.Stdout, opts)
	}
	slog.SetDefault(slog.New(h))
}
