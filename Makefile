.PHONY: all build server dashboard dev dev-server dev-dashboard lint test clean

# ── Build ─────────────────────────────────────────────────────────────────────

all: build

build: server dashboard

server:
	cd server && go build -o ../bin/kast ./cmd/kast

dashboard:
	cd dashboard && npm run build

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
