# Contributing to Kast

Thank you for your interest in contributing! This document covers how to set up a local development environment, open issues, and submit pull requests.

## Prerequisites

- **Go 1.25+** — [go.dev/dl](https://go.dev/dl/)
- **Node.js 22+** — [nodejs.org](https://nodejs.org/)
- **ffmpeg** — `brew install ffmpeg` / `apt install ffmpeg`
- **yt-dlp** (optional, for YouTube import) — [yt-dlp.org](https://github.com/yt-dlp/yt-dlp)

## Local Setup

```bash
git clone https://github.com/riza/kast.git
cd kast
```

### Server

```bash
cd server
cp kast.example.toml kast.toml
# Edit kast.toml — at minimum set api_key and jwt_secret
go build -o kast ./cmd/kast
./kast -config kast.toml
```

### Dashboard

In a separate terminal:

```bash
cd dashboard
npm install
npm run dev
```

The dashboard is available at `http://localhost:3000`. The server API runs at `http://localhost:8080`.

## Opening Issues

- Search existing issues before opening a new one.
- For **bug reports**, include: OS, Go/Node versions, steps to reproduce, and relevant log output.
- For **feature requests**, describe the use case and expected behaviour.

## Pull Request Process

1. Fork the repository and create a feature branch from `main`:
   ```bash
   git checkout -b feature/my-change
   ```
2. Keep changes focused — one logical change per PR.
3. Run `go build ./...` and `go test ./...` in `server/` before pushing.
4. Run `npm run build` in `dashboard/` to catch TypeScript errors.
5. Open a PR against `main` with a clear description of what changed and why.

## Code Style

- **Go**: follow standard `gofmt` / `go vet` conventions.
- **TypeScript**: the project uses ESLint; run `npm run lint` before submitting.
- Default to no comments — add one only when the *why* is non-obvious.

## Sensitive Files

`server/kast.toml` is listed in `.gitignore` and must never be committed. Use `server/kast.example.toml` as the template and keep secrets out of version control.
