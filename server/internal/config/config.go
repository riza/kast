// Package config loads and validates the Kast TOML configuration.
package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/BurntSushi/toml"
)

// Config is the top-level configuration structure.
type Config struct {
	Server  ServerConfig  `toml:"server"`
	Admin   AdminConfig   `toml:"admin"`
	HLS     HLSConfig     `toml:"hls"`
	Library LibraryConfig `toml:"library"`
	AutoDJ  AutoDJConfig  `toml:"autodj"`
	SSL     SSLConfig     `toml:"ssl"`
	Log     LogConfig     `toml:"log"`
}

type ServerConfig struct {
	HTTPAddr    string   `toml:"http_addr"`
	PublicURL   string   `toml:"public_url"`
	CORSOrigins []string `toml:"cors_origins"`
}

type AdminConfig struct {
	APIKey string `toml:"api_key"`
}

type SSLConfig struct {
	Enabled  bool     `toml:"enabled"`
	AutoCert bool     `toml:"auto_cert"`
	Domains  []string `toml:"domains"`
	CertFile string   `toml:"cert_file"`
	KeyFile  string   `toml:"key_file"`
	CertDir  string   `toml:"cert_dir"`
	HTTPAddr string   `toml:"http_addr"`
}

type HLSConfig struct {
	SegmentDuration int    `toml:"segment_duration"`
	PlaylistSize    int    `toml:"playlist_size"`
	OutputDir       string `toml:"output_dir"`
}

type LibraryConfig struct {
	ScanDirs        []string `toml:"scan_dirs"`
	AudioExtensions []string `toml:"audio_extensions"`
}

type AutoDJConfig struct {
	DefaultMode string `toml:"default_mode"`
	CrossfadeMs int    `toml:"crossfade_ms"`
}

type LogConfig struct {
	Level  string `toml:"level"`
	Format string `toml:"format"`
}

// Load reads and validates a TOML config file.
func Load(path string) (*Config, error) {
	f, err := os.Open(filepath.Clean(path))
	if err != nil {
		return nil, fmt.Errorf("config: open %q: %w", path, err)
	}
	defer f.Close()

	var cfg Config
	if _, err := toml.NewDecoder(f).Decode(&cfg); err != nil {
		return nil, fmt.Errorf("config: decode: %w", err)
	}

	return &cfg, cfg.validate()
}

func (c *Config) validate() error {
	var errs []string

	if c.Admin.APIKey == "" {
		errs = append(errs, "admin.api_key must not be empty")
	}
	if c.Admin.APIKey == "CHANGE_ME_BEFORE_PRODUCTION" {
		fmt.Fprintln(os.Stderr, "WARNING: using default admin.api_key — change before deploying to production")
	}
	if c.Server.HTTPAddr == "" {
		c.Server.HTTPAddr = ":8080"
	}
	if c.Server.PublicURL == "" {
		errs = append(errs, "server.public_url must not be empty")
	}
	if c.HLS.SegmentDuration <= 0 {
		c.HLS.SegmentDuration = 6
	}
	if c.HLS.PlaylistSize <= 0 {
		c.HLS.PlaylistSize = 5
	}
	if c.HLS.OutputDir == "" {
		c.HLS.OutputDir = "./data/hls"
	}
	if len(c.Library.ScanDirs) == 0 {
		c.Library.ScanDirs = []string{"./data/music"}
	}
	if len(c.Library.AudioExtensions) == 0 {
		c.Library.AudioExtensions = []string{".mp3", ".flac", ".aac", ".ogg", ".wav", ".opus", ".m4a"}
	}

	mode := strings.ToLower(c.AutoDJ.DefaultMode)
	if mode != "sequential" && mode != "shuffle" && mode != "" {
		errs = append(errs, "autodj.default_mode must be \"sequential\" or \"shuffle\"")
	}
	if c.AutoDJ.DefaultMode == "" {
		c.AutoDJ.DefaultMode = "sequential"
	}

	// SSL defaults
	if c.SSL.CertDir == "" {
		c.SSL.CertDir = "./data/certs"
	}
	if c.SSL.HTTPAddr == "" {
		c.SSL.HTTPAddr = ":443"
	}
	if c.SSL.Enabled && !c.SSL.AutoCert {
		if c.SSL.CertFile == "" || c.SSL.KeyFile == "" {
			errs = append(errs, "ssl.cert_file and ssl.key_file are required when ssl.enabled=true and ssl.auto_cert=false")
		}
	}
	if c.SSL.AutoCert && len(c.SSL.Domains) == 0 {
		errs = append(errs, "ssl.domains must not be empty when ssl.auto_cert=true")
	}

	level := strings.ToLower(c.Log.Level)
	switch level {
	case "debug", "info", "warn", "error", "":
	default:
		errs = append(errs, "log.level must be one of: debug, info, warn, error")
	}
	if c.Log.Level == "" {
		c.Log.Level = "info"
	}
	if c.Log.Format == "" {
		c.Log.Format = "text"
	}

	if len(errs) > 0 {
		return errors.New("config: " + strings.Join(errs, "; "))
	}
	return nil
}
