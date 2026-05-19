# API Reference

All `/api/*` endpoints require a valid session or API key:

```
Authorization: Bearer <api_key>
```

Errors always return `{"error": "message"}` with an appropriate HTTP status code.

**Rate limits:** `/api/*` — 200 req/min per IP · `/api/auth/login` — 10 req/min per IP · `/hls/*` — 300 req/min per IP.

---

## Status

### `GET /api/status`

Server health and build info.

**Response**

```json
{
  "version":    "1.2.0",
  "git_commit": "abc1234",
  "build_time": "2024-11-01T10:00:00Z",
  "uptime_sec": 3600,
  "go_version": "go1.25.0",
  "os_arch":    "linux/amd64",
  "cpu_percent": 2.4,
  "mem_rss_mb": 48
}
```

`cpu_percent` and `mem_rss_mb` are `-1` when unavailable.

---

## Listeners

### `GET /api/listeners`

Active listeners across all mounts (last 30 seconds).

**Response** — array of listener objects

```json
[
  {
    "ip":           "203.0.113.1",
    "mount":        "/radio",
    "last_seen":    "2024-11-01T14:32:00Z",
    "country_code": "DE",
    "user_agent":   "Mozilla/5.0 ..."
  }
]
```

---

## Mounts

A mount is a named stream endpoint. The name is used as the path segment in stream URLs (e.g. `/hls/radio/index.m3u8`).

**Mount object**

```json
{
  "id":          "550e8400-e29b-41d4-a716-446655440000",
  "name":        "/radio",
  "description": "My Radio Station",
  "genre":       "Electronic",
  "website":     "https://example.com",
  "protocol":    "HLS",
  "codec":       "AAC",
  "bitrate":     "128k",
  "status":      "live",
  "listeners":   5,
  "created_at":  "2024-11-01T10:00:00Z",
  "player_station_name":  "KAST FM",
  "player_accent":        "#3b82f6",
  "player_accent_soft":   "rgba(59,130,246,0.15)",
  "player_theme":         "dark",
  "player_layout":        "split",
  "player_ambient":       false,
  "player_show_about":    true,
  "player_show_history":  true,
  "player_show_playlist": false,
  "jingle_playlist_id":   "",
  "jingle_every_tracks":  0,
  "jingle_every_minutes": 0
}
```

`status`: `"idle"` | `"live"` | `"error"`  
`protocol`: `"HLS"` | `"LL-HLS"`  
`codec`: `"AAC"` | `"MP3"` | `"OPUS"`  
`bitrate`: `"64k"` | `"128k"` | `"192k"` | `"320k"` etc.

---

### `GET /api/mounts`

List all mounts.

**Response** — array of mount objects

---

### `POST /api/mounts`

Create a mount.

**Request**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Alphanumeric + `-_`, 1–64 chars (e.g. `"radio"`) |
| `source_password` | string | yes | Password for Icecast/live source auth, min 8 chars |
| `description` | string | no | |
| `genre` | string | no | |
| `website` | string | no | |
| `codec` | string | no | Default: `"AAC"` |
| `bitrate` | string | no | Default: `"128k"` |
| `protocol` | string | no | Default: `"HLS"` |

```json
{
  "name":            "radio",
  "source_password": "s3cr3tpassword",
  "description":     "Main station",
  "codec":           "AAC",
  "bitrate":         "128k",
  "protocol":        "HLS"
}
```

**Response** `201` — created mount object  
**Errors** `400` invalid fields · `409` mount name already exists

---

### `GET /api/mounts/:name`

Get a single mount.

**Response** `200` — mount object · `404` not found

---

### `PATCH /api/mounts/:name`

Update audio config or metadata. All fields optional. Changing `codec`, `bitrate`, or `protocol` while AutoDJ is running automatically restarts it.

**Request**

```json
{
  "description": "Updated description",
  "genre":       "House",
  "website":     "https://example.com",
  "codec":       "MP3",
  "bitrate":     "192k",
  "protocol":    "LL-HLS"
}
```

**Response** `200`

```json
{
  "id": "...",
  "name": "/radio",
  "...",
  "autodj_restarted": true
}
```

`autodj_restarted` is `true` if the audio config changed and a session was restarted.

---

### `DELETE /api/mounts/:name`

Delete a mount. Stops any running AutoDJ session first.

**Response** `204` · `404` not found

---

### `PUT /api/mounts/:name/player`

Update the embedded web player appearance.

**Request**

```json
{
  "player_station_name":  "KAST FM",
  "player_accent":        "#3b82f6",
  "player_accent_soft":   "rgba(59,130,246,0.15)",
  "player_theme":         "dark",
  "player_layout":        "split",
  "player_ambient":       false,
  "player_show_about":    true,
  "player_show_history":  true,
  "player_show_playlist": false
}
```

**Response** `200` — `{"status": "ok"}`

---

### `PUT /api/mounts/:name/jingles`

Configure jingle/ad insertion for a mount. See [Jingle Insertion](jingle-insertion.md).

**Request**

```json
{
  "jingle_playlist_id":   "abc123",
  "jingle_every_tracks":  4,
  "jingle_every_minutes": 0
}
```

Set both counts to `0` or clear `jingle_playlist_id` to disable.

**Response** `200` — `{"status": "ok"}`

---

## AutoDJ

### `POST /api/mounts/:name/autodj`

Start AutoDJ on a mount.

**Request**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `playlist_id` | string | yes | Playlist to play |
| `mode` | string | no | `"sequential"` or `"shuffle"` — overrides playlist's own mode |
| `start_track_path` | string | no | Resume from a specific track path |

```json
{
  "playlist_id": "550e8400-e29b-41d4-a716-446655440000",
  "mode":        "shuffle"
}
```

**Response** `200`

```json
{
  "status":    "started",
  "mount":     "/radio",
  "tracks":    42,
  "mode":      "shuffle",
  "crossfade": 2000
}
```

**Errors** `400` missing `playlist_id` · `404` playlist not found · `422` playlist has no tracks in library

---

### `GET /api/mounts/:name/autodj`

AutoDJ session status.

**Response** `200`

```json
{
  "mount":       "/radio",
  "playlist_id": "...",
  "mode":        "shuffle"
}
```

`404` if no active session.

---

### `DELETE /api/mounts/:name/autodj`

Stop AutoDJ.

**Response** `204` · `404` no active session

---

### `POST /api/mounts/:name/autodj/skip`

Skip the current track.

**Response** `200` — `{"status": "skipped"}` · `404` no active session

---

### `GET /api/mounts/:name/autodj/tracks`

All tracks in the current session's playlist, plus the queue.

**Response** `200`

```json
{
  "tracks": [
    { "id": "...", "title": "Blue Monday", "artist": "New Order", "album": "Power, Corruption & Lies", "duration_ms": 437000 }
  ],
  "now_playing_id": "...",
  "queue": []
}
```

`404` if no active session.

---

### `POST /api/mounts/:name/autodj/jump`

Jump to a specific track index in the playlist.

**Request**

```json
{ "index": 5 }
```

**Response** `200` — `{"status": "jumped", "index": 5}` · `404` no active session

---

### `POST /api/mounts/:name/autodj/queue`

Insert a track to play next (one-shot, does not affect the main playlist order).

**Request**

```json
{ "track_id": "550e8400-e29b-41d4-a716-446655440000" }
```

**Response** `200` — `{"status": "queued"}` · `404` track or session not found

---

### `GET /api/mounts/:name/autodj/history`

Recently played tracks on this mount (in-memory, cleared on restart).

**Response** `200` — array of `{ id, title, artist, album, duration_ms }`

---

### `GET /api/mounts/:name/nowplaying`

Currently playing track, or `null` if idle.

**Response** `200`

```json
{
  "id":          "...",
  "title":       "Blue Monday",
  "artist":      "New Order",
  "album":       "Power, Corruption & Lies",
  "duration_ms": 437000
}
```

---

### `GET /api/autodj/sessions`

All active AutoDJ sessions across every mount.

**Response** `200` — array of session objects

---

## Library

**Track object**

```json
{
  "id":          "550e8400-e29b-41d4-a716-446655440000",
  "path":        "/data/music/New Order/Blue Monday.mp3",
  "title":       "Blue Monday",
  "artist":      "New Order",
  "album":       "Power, Corruption & Lies",
  "genre":       "Electronic",
  "duration_ms": 437000,
  "bitrate_kbps": 320,
  "size_bytes":  17500000,
  "folder":      "New Order",
  "added_at":    "2024-11-01T10:00:00Z",
  "has_override": false
}
```

When `has_override` is `true`, the original file tags are also included:

```json
{
  "has_override":    true,
  "original_title":  "BLUE MONDAY",
  "original_artist": "NEW ORDER",
  "original_album":  "",
  "original_genre":  ""
}
```

---

### `GET /api/library`

List all tracks. Supports filtering.

**Query parameters**

| Param | Description |
|-------|-------------|
| `q` | Search across `title`, `artist`, `album` (case-insensitive substring) |
| `genre` | Exact genre match (case-insensitive) |

**Response** `200` — array of track objects

---

### `POST /api/library/upload`

Upload audio files. `Content-Type: multipart/form-data`, field name `files`.

Accepted formats: `.mp3`, `.flac`, `.ogg`, `.wav`, `.aac`, `.m4a`, `.opus`.  
Max request body: 500 MB. Multiple files may be sent in a single request.

**Response** `200`

```json
{
  "uploaded": [
    { "name": "track.mp3" },
    { "name": "bad.exe", "error": "unsupported format" }
  ]
}
```

A library scan runs automatically after upload.

---

### `PATCH /api/library/:id`

Override track metadata (does not modify the file's ID3 tags).

**Request** — all fields optional

```json
{
  "title":  "Blue Monday (12\" Version)",
  "artist": "New Order",
  "album":  "Power, Corruption & Lies",
  "genre":  "Post-punk"
}
```

**Response** `200` — updated track object · `404` track not found

---

### `DELETE /api/library/:id/override`

Remove metadata override, restoring the original file tags.

**Response** `200` — track object with original tags · `404` track not found

---

### `POST /api/library/scan`

Trigger a background library scan of configured `scan_dirs`.

**Response** `200` — `{"status": "scan started"}`

---

### `POST /api/library/import/youtube/preview`

Fetch metadata for a YouTube URL before importing.

**Request**

```json
{ "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }
```

**Response** `200` — preview result with video/playlist items  
**Errors** `400` missing URL · `422` invalid or unavailable URL

---

### `POST /api/library/import/youtube`

Start a YouTube import job (downloads via `yt-dlp`).

**Request**

```json
{
  "items": [
    {
      "ytid":        "dQw4w9WgXcQ",
      "title":       "Never Gonna Give You Up",
      "artist":      "Rick Astley",
      "duration_ms": 212000,
      "thumbnail":   "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    }
  ]
}
```

`title`, `artist`, `duration_ms`, `thumbnail` are optional metadata hints.

**Response** `200`

```json
{
  "job_id":     "abc123",
  "created_at": "2024-11-01T14:00:00Z"
}
```

---

### `GET /api/library/imports`

List all import jobs.

**Response** `200` — array of job objects

---

### `GET /api/library/imports/:id`

Get import job status and progress.

**Response** `200` — job object · `404` not found

---

## Playlists

**Playlist object**

```json
{
  "id":               "550e8400-e29b-41d4-a716-446655440000",
  "name":             "Weekend Vibes",
  "description":      "",
  "mode":             "shuffle",
  "crossfade_ms":     2000,
  "track_paths":      ["/data/music/track1.mp3", "/data/music/track2.mp3"],
  "last_played_path": "/data/music/track1.mp3",
  "created_at":       "2024-11-01T10:00:00Z",
  "updated_at":       "2024-11-01T12:00:00Z"
}
```

`mode`: `"sequential"` | `"shuffle"`

---

### `GET /api/playlists`

List all playlists.

**Response** `200` — array of playlist objects

---

### `POST /api/playlists`

Create a playlist.

**Request**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | |
| `description` | string | no | |
| `mode` | string | no | Default: `"sequential"` |
| `crossfade_ms` | integer | no | Crossfade duration in ms (0 = disabled) |
| `track_paths` | array of strings | no | Ordered list of file paths |

```json
{
  "name":         "Weekend Vibes",
  "mode":         "shuffle",
  "crossfade_ms": 2000,
  "track_paths":  ["/data/music/track1.mp3"]
}
```

**Response** `201` — created playlist object · `400` missing name

---

### `GET /api/playlists/:id`

Get a single playlist.

**Response** `200` — playlist object · `404` not found

---

### `PUT /api/playlists/:id`

Replace playlist fields. All fields are optional — omitted fields are left unchanged.

**Request**

```json
{
  "name":         "Weekend Vibes (Updated)",
  "mode":         "sequential",
  "crossfade_ms": 0,
  "track_paths":  ["/data/music/track2.mp3", "/data/music/track1.mp3"]
}
```

**Response** `200` — updated playlist object · `400` · `404`

---

### `DELETE /api/playlists/:id`

Delete a playlist.

**Response** `204` · `404`

---

## Schedules

Schedules drive time-based AutoDJ rotation. See [Scheduled Playlists](scheduled-playlists.md) for a full guide.

**Schedule object**

```json
{
  "id":            "550e8400-e29b-41d4-a716-446655440000",
  "name":          "Morning Show",
  "mount":         "/radio",
  "playlist_id":   "...",
  "days_mask":     62,
  "start_minutes": 420,
  "end_minutes":   540,
  "enabled":       true,
  "created_at":    "2024-11-01T10:00:00Z"
}
```

**`days_mask`** — bitmask of active weekdays. Bit 0 = Sunday, bit 6 = Saturday.

| Day | Bit | Value |
|-----|-----|-------|
| Sunday | 0 | 1 |
| Monday | 1 | 2 |
| Tuesday | 2 | 4 |
| Wednesday | 3 | 8 |
| Thursday | 4 | 16 |
| Friday | 5 | 32 |
| Saturday | 6 | 64 |

Mon–Fri = `2+4+8+16+32` = **62** · Every day = **127** · Weekends = **65**

**`start_minutes` / `end_minutes`** — minutes since midnight in the server timezone (0 = 00:00, 420 = 07:00, 1440 = 24:00). Midnight-crossing (e.g. 23:00–01:00) is not supported; create two entries instead.

---

### `GET /api/schedules`

List all schedules.

**Response** `200` — array of schedule objects

---

### `POST /api/schedules`

Create a schedule.

**Request**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `name` | string | yes | |
| `mount` | string | yes | Must be an existing mount name (e.g. `"/radio"`) |
| `playlist_id` | string | yes | Must be an existing playlist |
| `days_mask` | integer | yes | 1–127 |
| `start_minutes` | integer | yes | 0–1439 |
| `end_minutes` | integer | yes | 1–1440, must be > `start_minutes` |
| `enabled` | boolean | no | Default: `true` |

```json
{
  "name":          "Morning Show",
  "mount":         "/radio",
  "playlist_id":   "550e8400-e29b-41d4-a716-446655440000",
  "days_mask":     62,
  "start_minutes": 420,
  "end_minutes":   540,
  "enabled":       true
}
```

**Response** `201` — created schedule object  
**Errors** `400` validation failure or overlap with an existing schedule on the same mount

---

### `GET /api/schedules/:id`

Get a single schedule.

**Response** `200` — schedule object · `404`

---

### `PATCH /api/schedules/:id`

Update a schedule. All fields optional — only sent fields are changed.

**Request**

```json
{
  "name":    "Afternoon Block",
  "enabled": false
}
```

**Response** `200` — updated schedule object · `400` · `404`

---

### `DELETE /api/schedules/:id`

Delete a schedule.

**Response** `204` · `404`

---

## Webhooks

Kast delivers HTTP POST events to registered endpoints. See [Webhooks](webhooks.md) for a full event reference.

**Webhook object**

```json
{
  "id":         "550e8400-e29b-41d4-a716-446655440000",
  "url":        "https://example.com/hooks/kast",
  "events":     ["autodj.track.changed", "listener.count.changed"],
  "enabled":    true,
  "created_at": "2024-11-01T10:00:00Z"
}
```

`events` is empty when the webhook subscribes to all events. `secret` is never returned after creation.

---

### `GET /api/webhooks`

List all webhooks.

**Response** `200` — array of webhook objects

---

### `POST /api/webhooks`

Create a webhook.

**Request**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | yes | HTTP or HTTPS endpoint |
| `events` | array of strings | no | Empty = receive all events |
| `secret` | string | no | HMAC-SHA256 signing key (see [Webhooks](webhooks.md#signature-verification)) |
| `enabled` | boolean | no | Default: `true` |

```json
{
  "url":     "https://example.com/hooks/kast",
  "events":  ["autodj.track.changed"],
  "secret":  "my-signing-secret",
  "enabled": true
}
```

**Response** `201` — webhook object  
**Errors** `400` invalid URL or unknown event name

---

### `GET /api/webhooks/:id`

Get a single webhook.

**Response** `200` — webhook object · `404`

---

### `PATCH /api/webhooks/:id`

Update a webhook. All fields optional.

```json
{
  "enabled": false
}
```

**Response** `200` — updated webhook object · `400` · `404`

---

### `DELETE /api/webhooks/:id`

Delete a webhook.

**Response** `204` · `404`

---

## API Keys

**API key object**

```json
{
  "id":           "550e8400-e29b-41d4-a716-446655440000",
  "name":         "Home Assistant Integration",
  "prefix":       "kast_",
  "created_at":   "2024-11-01T10:00:00Z",
  "last_used_at": "2024-11-01T14:32:00Z",
  "expires_at":   null,
  "enabled":      true,
  "ip_allowlist": ["192.168.1.0/24"]
}
```

`last_used_at` and `expires_at` are `null` when not set.

---

### `GET /api/apikeys`

List all API keys (no plaintext keys returned).

**Response** `200` — array of API key objects

---

### `POST /api/apikeys`

Create an API key. The plaintext key is returned **only in this response** — store it securely.

**Request**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Human-readable label |
| `expires_at` | string | no | ISO 8601 (`"2025-01-01T00:00:00Z"`) or date (`"2025-01-01"`) |
| `ip_allowlist` | array of strings | no | CIDR blocks (e.g. `["10.0.0.0/8"]`) — empty = allow all |

```json
{
  "name":         "Home Assistant",
  "expires_at":   "2025-12-31",
  "ip_allowlist": ["192.168.1.0/24"]
}
```

**Response** `201`

```json
{
  "id":           "...",
  "name":         "Home Assistant",
  "prefix":       "kast_",
  "created_at":   "2024-11-01T10:00:00Z",
  "last_used_at": null,
  "expires_at":   "2025-12-31T23:59:59Z",
  "enabled":      true,
  "ip_allowlist": ["192.168.1.0/24"],
  "key":          "kast_xxxxxxxxxxxxxxxxxxxxxxxx"
}
```

---

### `PATCH /api/apikeys/:id`

Update an API key. All fields optional.

```json
{
  "name":         "Updated Label",
  "enabled":      false,
  "ip_allowlist": [],
  "expires_at":   null
}
```

**Response** `200` — updated key object · `400` · `404`

---

### `DELETE /api/apikeys/:id`

Revoke an API key.

**Response** `204` · `404`

---

## Public Endpoints

No authentication required. CORS is open (`Access-Control-Allow-Origin: *`).

### `GET /public/:mount`

Mount info and now-playing state for a listener page or widget.

**Response** `200`

```json
{
  "name":        "/radio",
  "description": "My Radio Station",
  "genre":       "Electronic",
  "website":     "https://example.com",
  "protocol":    "HLS",
  "codec":       "AAC",
  "bitrate":     "128k",
  "status":      "live",
  "listeners":   14,
  "now_playing": {
    "title":       "Blue Monday",
    "artist":      "New Order",
    "album":       "Power, Corruption & Lies",
    "duration_ms": 437000
  },
  "player_station_name":  "KAST FM",
  "player_accent":        "#3b82f6",
  "player_accent_soft":   "rgba(59,130,246,0.15)",
  "player_theme":         "dark",
  "player_layout":        "split",
  "player_ambient":       false,
  "player_show_about":    true,
  "player_show_history":  true,
  "player_show_playlist": false
}
```

`now_playing` is `null` when nothing is playing.

---

### `GET /public/:mount/history`

Recently played tracks.

**Response** `200` — array of `{ title, artist, album, duration_ms }`

---

### `GET /public/:mount/playlist`

Current playlist contents.

**Response** `200`

```json
{
  "name":   "Weekend Vibes",
  "mode":   "shuffle",
  "tracks": [
    { "title": "Blue Monday", "artist": "New Order", "album": "...", "duration_ms": 437000 }
  ]
}
```

Returns `[]` when no AutoDJ session is active.

---

## HLS Streaming

### `GET /hls/:mount/*`

HLS playlist and segment files. Rate-limited to 300 req/min per IP.

| Path | Description |
|------|-------------|
| `/hls/radio/index.m3u8` | HLS playlist (standard or LL-HLS) |
| `/hls/radio/segment-001.ts` | MPEG-TS audio segment |
| `/hls/radio/init.mp4` | fMP4 init segment (LL-HLS only) |

LL-HLS clients may use `?_HLS_msn=X&_HLS_part=Y` for blocking playlist reload — Kast holds the request until that part is available.

---

## Live Source Input

### `PUT /source/:mount`

Icecast-compatible live source streaming. This endpoint uses `source_password` Bearer auth — **not** the admin API key.

```
Authorization: Bearer <source_password>
Content-Type: audio/mpeg  (or audio/ogg, audio/aac, etc.)
```

Send raw audio as a chunked HTTP body. Compatible with OBS, BUTT, Liquidsoap, and any Icecast-compatible source.

**Errors** `401` wrong password · `409` another source is already connected

---

## WebRTC (WHEP)

### `POST /whep/:name`

WebRTC HTTP Egress Protocol — receive the stream as WebRTC. No auth required.

```
Content-Type: application/sdp

<SDP offer>
```

**Response** `200` — SDP answer with `Content-Type: application/sdp`
