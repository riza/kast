# Kast

A lightweight, self-hosted internet radio streaming server. Drop in your audio files, create playlists, and broadcast HLS streams — no complex setup required.

<!-- TODO: Uncomment when public repo is ready
[![Go](https://img.shields.io/badge/Go-1.25-00ADD8?logo=go)](https://go.dev)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js)](https://nextjs.org)
[![License](https://img.shields.io/github/license/riza/kast)](LICENSE)
[![Docker](https://img.shields.io/docker/pulls/riza/kast)](https://hub.docker.com/r/riza/kast)
-->

## Features

- **HLS Streaming** — Serve audio as HTTP Live Streaming, playable in any modern browser or media player
- **AutoDJ** — Automatic playback with sequential or shuffle modes; skip tracks, manage queues
- **Media Library** — Scan directories for audio files, upload via browser with drag-and-drop, import from YouTube
- **Playlists** — Create and manage playlists, assign them to mounts for continuous playback
- **Live Source Input** — Icecast-compatible `PUT /source/{mount}` endpoint for OBS, BUTT, Liquidsoap, etc.
- **Public Player** — Embeddable web player with now-playing info, history, and customizable themes
- **Dashboard** — Modern admin UI built with Next.js, shadcn/ui, and Tailwind CSS
- **SSL / Custom Domain** — Built-in Let's Encrypt auto-cert or manual TLS; point your domain and go
- **Docker Ready** — Single `docker compose up` to run the full stack
- **Minimal Dependencies** — Go binary + ffmpeg; no database required (file-based state)

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Clients                          │
│  (Browsers, VLC, mobile apps, embedded players)     │
└──────────────┬──────────────────────┬───────────────┘
               │ HLS (.m3u8/.ts)      │ REST API
               ▼                      ▼
┌─────────────────────────────────────────────────────┐
│                  Kast Server (Go)                    │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  Router  │  │ HLS Seg- │  │   AutoDJ Player  │  │
│  │ (Fiber)  │  │  menter  │  │  (ffmpeg pipes)  │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  Mount   │  │ Library  │  │ Source Handler   │  │
│  │ Manager  │  │ Scanner  │  │ (Icecast compat) │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│  File System: /data/music, /data/hls, /data/mounts  │
└─────────────────────────────────────────────────────┘
```

## Quick Start

### Docker Compose (recommended)

```bash
git clone https://github.com/riza/kast.git
cd kast

# Copy and edit the config
cp server/kast.toml server/kast.toml
# Edit server/kast.toml — at minimum, change the api_key

# Start everything
docker compose up -d
```

The dashboard will be available at `http://localhost:3000` and the streaming server at `http://localhost:8080`.

### Manual Setup

**Prerequisites:** Go 1.25+, Node.js 22+, ffmpeg

```bash
# Server
cd server
go build -o kast ./cmd/kast
./kast -config kast.toml

# Dashboard
cd dashboard
npm install
npm run dev
```

### Add Music & Start Streaming

1. Place audio files in `server/data/music/` (or upload via the dashboard)
2. Open the dashboard at `http://localhost:3000`
3. Create a mount point (e.g. `/radio`)
4. Create a playlist and add tracks
5. Start the AutoDJ on your mount
6. Listen at `http://localhost:8080/player/radio`

## Configuration

Kast is configured via a single TOML file. See [`server/kast.toml`](server/kast.toml) for the full reference.

| Section | Key Options |
|---------|-------------|
| `[server]` | `http_addr`, `public_url`, `cors_origins` |
| `[admin]` | `api_key` — required for all API requests |
| `[hls]` | `segment_duration`, `playlist_size`, `output_dir` |
| `[library]` | `scan_dirs`, `audio_extensions` |
| `[autodj]` | `default_mode` (sequential/shuffle), `crossfade_ms` |
| `[ssl]` | `enabled`, `auto_cert`, `domains`, `cert_file`, `key_file`, `cert_dir` |
| `[log]` | `level` (debug/info/warn/error), `format` (text/json) |

### SSL / Custom Domain

Kast supports HTTPS with automatic Let's Encrypt certificates or manual cert files.

**Auto-cert (recommended for production):**

```toml
[ssl]
enabled   = true
auto_cert = true
domains   = ["radio.example.com"]
cert_dir  = "./data/certs"
http_addr = ":443"
```

When `auto_cert = true`, Kast automatically obtains and renews TLS certificates from Let's Encrypt. The HTTP listener (`[server].http_addr`) becomes a redirect-to-HTTPS server. Port 443 must be reachable from the internet.

**Manual certificates:**

```toml
[ssl]
enabled   = true
auto_cert = false
cert_file = "/path/to/fullchain.pem"
key_file  = "/path/to/privkey.pem"
http_addr = ":443"
```

## API Reference

All admin endpoints require `Authorization: Bearer <api_key>`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/status` | Server status |
| `GET` | `/api/mounts` | List all mount points |
| `POST` | `/api/mounts` | Create a mount point |
| `GET` | `/api/mounts/{name}` | Get mount details |
| `DELETE` | `/api/mounts/{name}` | Delete a mount point |
| `POST` | `/api/mounts/{name}/autodj` | Start AutoDJ on mount |
| `DELETE` | `/api/mounts/{name}/autodj` | Stop AutoDJ |
| `POST` | `/api/mounts/{name}/autodj/skip` | Skip current track |
| `GET` | `/api/mounts/{name}/nowplaying` | Now playing info |
| `GET` | `/api/library` | List library tracks |
| `POST` | `/api/library/upload` | Upload audio files |
| `POST` | `/api/library/scan` | Trigger library scan |
| `GET` | `/api/playlists` | List playlists |
| `POST` | `/api/playlists` | Create playlist |
| `PUT` | `/api/playlists/{id}` | Update playlist |
| `DELETE` | `/api/playlists/{id}` | Delete playlist |

**Public endpoints** (no auth required):

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/hls/{mount}/*.m3u8` | HLS playlist |
| `GET` | `/hls/{mount}/*.ts` | HLS segments |
| `GET` | `/player/{mount}` | Web player page |
| `GET` | `/public/{mount}` | Mount info + now playing |
| `GET` | `/public/{mount}/history` | Recently played tracks |
| `GET` | `/public/{mount}/playlist` | Current playlist tracks |
| `PUT` | `/source/{mount}` | Live source input (Icecast-compatible) |

## Project Structure

```
kast/
├── server/                    # Go streaming server
│   ├── cmd/kast/              # Entry point
│   ├── internal/
│   │   ├── api/               # HTTP router, middleware, handlers
│   │   ├── autodj/            # AutoDJ player (ffmpeg-based)
│   │   ├── config/            # TOML config parser
│   │   ├── djmanager/         # DJ session manager
│   │   ├── hls/               # HLS segmenter
│   │   ├── library/           # Media library scanner
│   │   ├── mount/             # Mount point manager
│   │   ├── playlist/          # Playlist CRUD
│   │   ├── source/            # Live source handler
│   │   └── ytimport/          # YouTube import (yt-dlp)
│   ├── kast.toml              # Configuration file
│   └── Dockerfile
├── dashboard/                 # Next.js admin dashboard
│   ├── app/                   # App Router pages
│   ├── components/            # UI components (shadcn/ui)
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

## Roadmap

- [ ] Crossfade between tracks
- [ ] Live source → HLS pipeline (connect incoming audio to segmenter)
- [ ] Scheduled playlists (time-based rotation)
- [ ] Jingle/ad insertion (every N songs or N minutes)
- [ ] Webhooks (track change, listener connect/disconnect)
- [ ] Metadata editing
- [ ] Song request system (listeners request tracks via public API)
- [ ] Listener analytics history
- [ ] Web DJ (browser-based live broadcasting via WebRTC)
- [ ] Low-Latency HLS (LL-HLS) support

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Tech Stack

| Layer | Technology |
|-------|------------|
| Server | Go 1.25, Fiber v2, ffmpeg |
| Dashboard | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui |
| Streaming | HLS (HTTP Live Streaming) |
| Media Processing | ffmpeg (transcoding, segmenting) |
| YouTube Import | yt-dlp |
| Containerization | Docker, Docker Compose |

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
