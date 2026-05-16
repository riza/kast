# ── Build stage ───────────────────────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /kast ./cmd/kast

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM alpine:3.20

# ffmpeg for audio processing; yt-dlp from PyPI (Alpine package is too old for YouTube)
RUN apk add --no-cache ffmpeg ca-certificates python3 py3-pip && \
    pip3 install --break-system-packages --no-cache-dir yt-dlp

# Run as non-root user
RUN adduser -D -u 1001 kast
USER kast

WORKDIR /app
COPY --from=builder /kast /app/kast
COPY --chown=kast kast.example.toml /app/kast.example.toml

# Data directories (created as kast user)
RUN mkdir -p data/music data/hls data/mounts data/playlists

EXPOSE 8080 443

ENTRYPOINT ["/app/kast"]
CMD ["-config", "/app/kast.toml"]
