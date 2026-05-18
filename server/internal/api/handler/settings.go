package handler

import (
	"os"
	"strings"
	"sync"
	"time"

	"github.com/BurntSushi/toml"
	"github.com/gofiber/fiber/v2"
	"github.com/riza/kast/internal/api/respond"
	"github.com/riza/kast/internal/config"
)

// Settings handles reading and persisting server configuration.
type Settings struct {
	Cfg        *config.Config
	ConfigPath string
	mu         sync.Mutex
}

// SettingsBody is the flattened JSON representation of editable config fields.
type SettingsBody struct {
	PublicURL          string   `json:"public_url"`
	HTTPAddr           string   `json:"http_addr"`
	CORSOrigins        []string `json:"cors_origins"`
	TrustProxy         bool     `json:"trust_proxy"`
	SSLEnabled         bool     `json:"ssl_enabled"`
	SSLAutoCert        bool     `json:"ssl_auto_cert"`
	SSLDomains         []string `json:"ssl_domains"`
	SSLCertFile        string   `json:"ssl_cert_file"`
	SSLKeyFile         string   `json:"ssl_key_file"`
	HLSSegmentDuration int      `json:"hls_segment_duration"`
	HLSPlaylistSize    int      `json:"hls_playlist_size"`
	LogLevel           string   `json:"log_level"`
	LogFormat          string   `json:"log_format"`
	Timezone           string   `json:"timezone"`
}

func (h *Settings) toBody() SettingsBody {
	return SettingsBody{
		PublicURL:          h.Cfg.Server.PublicURL,
		HTTPAddr:           h.Cfg.Server.HTTPAddr,
		CORSOrigins:        h.Cfg.Server.CORSOrigins,
		TrustProxy:         h.Cfg.Server.TrustProxy,
		SSLEnabled:         h.Cfg.SSL.Enabled,
		SSLAutoCert:        h.Cfg.SSL.AutoCert,
		SSLDomains:         h.Cfg.SSL.Domains,
		SSLCertFile:        h.Cfg.SSL.CertFile,
		SSLKeyFile:         h.Cfg.SSL.KeyFile,
		HLSSegmentDuration: h.Cfg.HLS.SegmentDuration,
		HLSPlaylistSize:    h.Cfg.HLS.PlaylistSize,
		LogLevel:           h.Cfg.Log.Level,
		LogFormat:          h.Cfg.Log.Format,
		Timezone:           h.Cfg.Server.Timezone,
	}
}

// Get godoc: GET /api/settings
func (h *Settings) Get(c *fiber.Ctx) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	return respond.OK(c, h.toBody())
}

// Update godoc: PATCH /api/settings
func (h *Settings) Update(c *fiber.Ctx) error {
	var body SettingsBody
	if err := c.BodyParser(&body); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "invalid JSON")
	}

	if body.PublicURL == "" {
		return respond.Error(c, fiber.StatusBadRequest, "public_url must not be empty")
	}
	switch strings.ToLower(body.LogLevel) {
	case "debug", "info", "warn", "error":
	default:
		return respond.Error(c, fiber.StatusBadRequest, "log_level must be one of: debug, info, warn, error")
	}
	if body.LogFormat != "text" && body.LogFormat != "json" {
		return respond.Error(c, fiber.StatusBadRequest, "log_format must be text or json")
	}
	if body.HLSSegmentDuration <= 0 {
		return respond.Error(c, fiber.StatusBadRequest, "hls_segment_duration must be > 0")
	}
	if body.HLSPlaylistSize <= 0 {
		return respond.Error(c, fiber.StatusBadRequest, "hls_playlist_size must be > 0")
	}
	if body.Timezone == "" {
		body.Timezone = "UTC"
	}
	if _, err := time.LoadLocation(body.Timezone); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "timezone must be a valid IANA timezone (e.g. UTC, Europe/Istanbul)")
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	h.Cfg.Server.PublicURL = body.PublicURL
	if body.HTTPAddr != "" {
		h.Cfg.Server.HTTPAddr = body.HTTPAddr
	}
	if body.CORSOrigins != nil {
		h.Cfg.Server.CORSOrigins = body.CORSOrigins
	}
	h.Cfg.Server.TrustProxy = body.TrustProxy
	h.Cfg.Server.Timezone = body.Timezone
	h.Cfg.SSL.Enabled = body.SSLEnabled
	h.Cfg.SSL.AutoCert = body.SSLAutoCert
	if body.SSLDomains != nil {
		h.Cfg.SSL.Domains = body.SSLDomains
	}
	h.Cfg.SSL.CertFile = body.SSLCertFile
	h.Cfg.SSL.KeyFile = body.SSLKeyFile
	h.Cfg.HLS.SegmentDuration = body.HLSSegmentDuration
	h.Cfg.HLS.PlaylistSize = body.HLSPlaylistSize
	h.Cfg.Log.Level = body.LogLevel
	h.Cfg.Log.Format = body.LogFormat

	f, err := os.Create(h.ConfigPath)
	if err != nil {
		return respond.Error(c, fiber.StatusInternalServerError, "failed to open config file")
	}
	defer f.Close()
	if err := toml.NewEncoder(f).Encode(h.Cfg); err != nil {
		return respond.Error(c, fiber.StatusInternalServerError, "failed to write config")
	}

	return respond.OK(c, h.toBody())
}
