// Package version holds build-time version metadata injected via ldflags.
package version

// These are set at build time with:
//
//	go build -ldflags="-X github.com/riza/kast/internal/version.Version=v0.1.0 \
//	                    -X github.com/riza/kast/internal/version.GitCommit=$(git rev-parse --short HEAD) \
//	                    -X github.com/riza/kast/internal/version.BuildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
var (
	Version   = "dev"
	GitCommit = "unknown"
	BuildTime = "unknown"
)
