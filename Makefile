.PHONY: all build server dashboard dev dev-server dev-dashboard lint test clean

# ── Build ─────────────────────────────────────────────────────────────────────

VERSION    := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
GIT_COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS    := -X github.com/riza/kast/internal/version.Version=$(VERSION) \
              -X github.com/riza/kast/internal/version.GitCommit=$(GIT_COMMIT) \
              -X github.com/riza/kast/internal/version.BuildTime=$(BUILD_TIME)

all: build

build: server dashboard

server:
	cd server && go build -ldflags="$(LDFLAGS)" -o ../bin/kast ./cmd/kast

dashboard:
	cd dashboard && GIT_COMMIT=$(GIT_COMMIT) npm run build

# ── Development ───────────────────────────────────────────────────────────────

dev:
	@$(MAKE) -j2 dev-server dev-dashboard

dev-server:
	cd server && go run ./cmd/kast -config kast.toml

dev-dashboard:
	cd dashboard && npm run dev

# ── Quality ───────────────────────────────────────────────────────────────────

lint:
	cd server && go vet ./...
	cd dashboard && npm run lint 2>/dev/null || true

test:
	cd server && go test -race -timeout 60s ./...

# ── Helpers ───────────────────────────────────────────────────────────────────

# Generate a random API key and print it (use in kast.toml)
genkey:
	@openssl rand -hex 32

# Copy example config if kast.toml doesn't exist yet
init-config:
	@[ -f server/kast.toml ] || (cp server/kast.example.toml server/kast.toml && echo "Created server/kast.toml — edit before running")

clean:
	rm -rf bin
	cd server && go clean ./...
	cd server && rm -rf data/hls
