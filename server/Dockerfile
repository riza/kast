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
