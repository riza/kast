# ── Build stage ───────────────────────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .

ARG VERSION=dev
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w \
      -X github.com/riza/kast/internal/version.Version=${VERSION} \
      -X github.com/riza/kast/internal/version.GitCommit=${GIT_COMMIT} \
      -X github.com/riza/kast/internal/version.BuildTime=${BUILD_TIME}" \
    -o /kast ./cmd/kast

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM alpine:3.21

# ffmpeg for audio processing; yt-dlp from PyPI (Alpine package is too old for YouTube).
# nodejs provides the JavaScript runtime yt-dlp now requires for YouTube extraction.
RUN apk add --no-cache ffmpeg ca-certificates python3 py3-pip nodejs su-exec && \
    pip3 install --break-system-packages --no-cache-dir yt-dlp

# Create kast user but stay as root for now — data dirs must be created
# before dropping privileges so that volumes initialised by Docker inherit
# the correct ownership.
RUN adduser -D -u 1001 kast

WORKDIR /app
COPY --from=builder /kast /app/kast
COPY --chown=kast kast.example.toml /app/kast.example.toml
COPY --chown=kast entrypoint.sh /app/entrypoint.sh

# yt-dlp config: tell it to use the nodejs JavaScript runtime (installed above).
RUN mkdir -p /home/kast/.config/yt-dlp && \
    echo '--js-runtimes node' > /home/kast/.config/yt-dlp/config && \
    chown -R kast:kast /home/kast/.config

# Create data and config directories as root so Docker volumes get the right
# base ownership. chown + chmod 777 keeps them writable regardless of the uid
# that ends up running the container (named volumes copy image ownership).
RUN chmod +x /app/entrypoint.sh && \
    mkdir -p config data/music data/hls data/mounts data/playlists && \
    chown -R kast:kast config data && \
    chmod -R 777 config data

# Drop to non-root user for runtime (entrypoint switches via su-exec after
# fixing permissions on volumes).
EXPOSE 8080 443

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["/app/kast", "-config", "/app/config/kast.toml"]
