package config_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/riza/kast/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const minimalValid = `
[server]
public_url = "http://localhost:8080"

[admin]
api_key    = "test-api-key"
jwt_secret = "test-jwt-secret"
`

func writeTOML(t *testing.T, content string) string {
	t.Helper()
	f, err := os.CreateTemp(t.TempDir(), "*.toml")
	require.NoError(t, err)
	_, err = f.WriteString(content)
	require.NoError(t, err)
	require.NoError(t, f.Close())
	return f.Name()
}

func TestLoad_Valid(t *testing.T) {
	cfg, err := config.Load(writeTOML(t, minimalValid))
	require.NoError(t, err)
	assert.Equal(t, "http://localhost:8080", cfg.Server.PublicURL)
	assert.Equal(t, "test-api-key", cfg.Admin.APIKey)
}

func TestLoad_Defaults(t *testing.T) {
	cfg, err := config.Load(writeTOML(t, minimalValid))
	require.NoError(t, err)
	assert.Equal(t, ":8080", cfg.Server.HTTPAddr)
	assert.Equal(t, "UTC", cfg.Server.Timezone)
	assert.Equal(t, 6, cfg.HLS.SegmentDuration)
	assert.Equal(t, 5, cfg.HLS.PlaylistSize)
	assert.Equal(t, "./data/hls", cfg.HLS.OutputDir)
	assert.Equal(t, "sequential", cfg.AutoDJ.DefaultMode)
	assert.Equal(t, "info", cfg.Log.Level)
	assert.Equal(t, "text", cfg.Log.Format)
	assert.NotEmpty(t, cfg.Library.ScanDirs)
	assert.NotEmpty(t, cfg.Library.AudioExtensions)
}

func TestLoad_MissingFile(t *testing.T) {
	_, err := config.Load(filepath.Join(t.TempDir(), "noexist.toml"))
	require.Error(t, err)
}

func TestLoad_InvalidTOML(t *testing.T) {
	_, err := config.Load(writeTOML(t, "this === is not [valid toml"))
	require.Error(t, err)
}

func TestValidate_MissingAPIKey(t *testing.T) {
	_, err := config.Load(writeTOML(t, `
[server]
public_url = "http://localhost"
[admin]
jwt_secret = "secret"
`))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "api_key")
}

func TestValidate_MissingJWTSecret(t *testing.T) {
	_, err := config.Load(writeTOML(t, `
[server]
public_url = "http://localhost"
[admin]
api_key = "key"
`))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "jwt_secret")
}

func TestValidate_MissingPublicURL(t *testing.T) {
	_, err := config.Load(writeTOML(t, `
[admin]
api_key    = "key"
jwt_secret = "secret"
`))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "public_url")
}

func TestValidate_InvalidTimezone(t *testing.T) {
	_, err := config.Load(writeTOML(t, `
[server]
public_url = "http://localhost"
timezone   = "Not/AReal/Timezone"
[admin]
api_key    = "key"
jwt_secret = "secret"
`))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "timezone")
}

func TestValidate_ValidTimezones(t *testing.T) {
	for _, tz := range []string{"UTC", "Europe/Istanbul", "America/New_York"} {
		cfg, err := config.Load(writeTOML(t, `
[server]
public_url = "http://localhost"
timezone   = "`+tz+`"
[admin]
api_key    = "key"
jwt_secret = "secret"
`))
		require.NoError(t, err, "timezone %q should be valid", tz)
		assert.Equal(t, tz, cfg.Server.Timezone)
	}
}

func TestValidate_InvalidAutodjMode(t *testing.T) {
	_, err := config.Load(writeTOML(t, `
[server]
public_url = "http://localhost"
[admin]
api_key    = "key"
jwt_secret = "secret"
[autodj]
default_mode = "random"
`))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "autodj")
}

func TestValidate_ValidAutodjModes(t *testing.T) {
	for _, mode := range []string{"sequential", "shuffle", "Sequential", "Shuffle"} {
		cfg, err := config.Load(writeTOML(t, `
[server]
public_url = "http://localhost"
[admin]
api_key    = "key"
jwt_secret = "secret"
[autodj]
default_mode = "`+mode+`"
`))
		require.NoError(t, err, "mode %q should be valid", mode)
		_ = cfg
	}
}

func TestValidate_SSLManualMissingCerts(t *testing.T) {
	_, err := config.Load(writeTOML(t, `
[server]
public_url = "http://localhost"
[admin]
api_key    = "key"
jwt_secret = "secret"
[ssl]
enabled   = true
auto_cert = false
`))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "cert_file")
}

func TestValidate_SSLAutoCertMissingDomains(t *testing.T) {
	_, err := config.Load(writeTOML(t, `
[server]
public_url = "http://localhost"
[admin]
api_key    = "key"
jwt_secret = "secret"
[ssl]
enabled   = true
auto_cert = true
`))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "ssl.domains")
}

func TestValidate_SSLAutoCert_Valid(t *testing.T) {
	cfg, err := config.Load(writeTOML(t, `
[server]
public_url = "https://example.com"
[admin]
api_key    = "key"
jwt_secret = "secret"
[ssl]
enabled   = true
auto_cert = true
domains   = ["example.com"]
`))
	require.NoError(t, err)
	assert.True(t, cfg.SSL.AutoCert)
	assert.Equal(t, []string{"example.com"}, cfg.SSL.Domains)
}

func TestValidate_InvalidLogLevel(t *testing.T) {
	_, err := config.Load(writeTOML(t, `
[server]
public_url = "http://localhost"
[admin]
api_key    = "key"
jwt_secret = "secret"
[log]
level = "verbose"
`))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "log.level")
}

func TestValidate_ValidLogLevels(t *testing.T) {
	for _, level := range []string{"debug", "info", "warn", "error"} {
		_, err := config.Load(writeTOML(t, `
[server]
public_url = "http://localhost"
[admin]
api_key    = "key"
jwt_secret = "secret"
[log]
level = "`+level+`"
`))
		require.NoError(t, err, "log level %q should be valid", level)
	}
}

func TestValidate_MultipleErrors(t *testing.T) {
	_, err := config.Load(writeTOML(t, `
[server]
public_url = ""
`))
	require.Error(t, err)
	// Should report all missing fields, not just the first.
	assert.Contains(t, err.Error(), "api_key")
	assert.Contains(t, err.Error(), "jwt_secret")
	assert.Contains(t, err.Error(), "public_url")
}
