# API Reference

All admin endpoints require `Authorization: Bearer <api_key>`.

## Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/status` | Server status and build info |

## Mounts

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/mounts` | List all mount points |
| `POST` | `/api/mounts` | Create a mount point |
| `GET` | `/api/mounts/{name}` | Get mount details |
| `PATCH` | `/api/mounts/{name}` | Update mount metadata / jingle config |
| `DELETE` | `/api/mounts/{name}` | Delete a mount point |

## AutoDJ

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/mounts/{name}/autodj` | Start AutoDJ on mount |
| `DELETE` | `/api/mounts/{name}/autodj` | Stop AutoDJ |
| `POST` | `/api/mounts/{name}/autodj/skip` | Skip current track |
| `GET` | `/api/mounts/{name}/autodj` | AutoDJ session status |
| `GET` | `/api/mounts/{name}/nowplaying` | Now playing info |

## Library

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/library` | List library tracks |
| `POST` | `/api/library/upload` | Upload audio files |
| `POST` | `/api/library/scan` | Trigger library scan |

## Playlists

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/playlists` | List playlists |
| `POST` | `/api/playlists` | Create playlist |
| `GET` | `/api/playlists/{id}` | Get playlist |
| `PUT` | `/api/playlists/{id}` | Update playlist |
| `DELETE` | `/api/playlists/{id}` | Delete playlist |

## Schedules

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/schedules` | List schedules |
| `POST` | `/api/schedules` | Create schedule |
| `GET` | `/api/schedules/{id}` | Get schedule |
| `PUT` | `/api/schedules/{id}` | Update schedule |
| `DELETE` | `/api/schedules/{id}` | Delete schedule |

## Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/webhooks` | List webhooks |
| `POST` | `/api/webhooks` | Create webhook |
| `GET` | `/api/webhooks/{id}` | Get webhook |
| `PATCH` | `/api/webhooks/{id}` | Update webhook |
| `DELETE` | `/api/webhooks/{id}` | Delete webhook |

## API Keys

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/apikeys` | List API keys |
| `POST` | `/api/apikeys` | Create API key |
| `DELETE` | `/api/apikeys/{id}` | Revoke API key |

---

## Public Endpoints

No authentication required.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/hls/{mount}/*.m3u8` | HLS playlist |
| `GET` | `/hls/{mount}/*.ts` | HLS segments |
| `GET` | `/player/{mount}` | Web player page |
| `GET` | `/public/{mount}` | Mount info + now playing |
| `GET` | `/public/{mount}/history` | Recently played tracks |
| `GET` | `/public/{mount}/playlist` | Current playlist tracks |
| `PUT` | `/source/{mount}` | Live source input (Icecast-compatible) |
