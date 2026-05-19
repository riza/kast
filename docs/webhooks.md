# Webhooks

Kast can POST a JSON payload to one or more URLs whenever something significant happens — a track changes, a schedule fires, a listener connects, etc. Webhooks are managed in **Dashboard → Settings → Webhooks** or via the admin API.

## Creating a Webhook

**Dashboard:** Settings → Webhooks → New Webhook. Enter a URL, optionally a signing secret, and choose which events to receive (leave empty to receive all).

**API:**

```http
POST /api/webhooks
Authorization: Bearer <api_key>
Content-Type: application/json

{
  "url": "https://example.com/hooks/kast",
  "events": ["autodj.track.changed", "listener.count.changed"],
  "secret": "my-signing-secret",
  "enabled": true
}
```

`events` is optional — omit or send `[]` to receive every event. `secret` is optional.

## Payload Envelope

Every delivery is an HTTP POST with `Content-Type: application/json`:

```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "event": "autodj.track.changed",
  "timestamp": "2024-11-01T14:32:00Z",
  "data": { ... }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Unique delivery ID |
| `event` | string | Event name |
| `timestamp` | string (RFC 3339) | UTC time of emission |
| `data` | object | Event-specific payload |

Kast waits up to 10 seconds for a 2xx response. No retries are attempted on failure — use an idempotent handler and monitor your server logs.

## Signature Verification

When a webhook has a `secret`, Kast adds:

```
X-Kast-Signature: sha256=<hex>
```

The signature is HMAC-SHA256 over the raw request body, keyed with the secret.

```python
import hashlib, hmac

def verify(secret: str, body: bytes, header: str) -> bool:
    expected = "sha256=" + hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, header)
```

## Event Reference

### Mount Events

| Event | When |
|-------|------|
| `mount.created` | A new mount point is created |
| `mount.deleted` | A mount is deleted |
| `mount.status.changed` | Mount status transitions (`live` / `idle` / `error`) |
| `mount.metadata.updated` | Mount display name or description updated |

**`mount.status.changed` data:**

```json
{ "mount": "/radio", "status": "live" }
```

---

### AutoDJ Events

| Event | When |
|-------|------|
| `autodj.started` | AutoDJ starts on a mount |
| `autodj.stopped` | AutoDJ stops on a mount |
| `autodj.track.changed` | A new track begins playing |
| `autodj.track.skipped` | The current track is skipped |

**`autodj.track.changed` data:**

```json
{
  "mount": "/radio",
  "id": 42,
  "title": "Blue Monday",
  "artist": "New Order",
  "album": "Power, Corruption & Lies",
  "duration_ms": 437000
}
```

**`autodj.started` data:**

```json
{ "mount": "/radio", "playlist_id": "abc123", "mode": "shuffle" }
```

---

### Listener Events

| Event | When |
|-------|------|
| `listener.count.changed` | Live listener count changes for a mount |

**`listener.count.changed` data:**

```json
{ "mount": "/radio", "listeners": 14 }
```

Emitted only when the count actually changes (not every poll cycle).

---

### Playlist Events

| Event | When |
|-------|------|
| `playlist.created` | A playlist is created |
| `playlist.updated` | A playlist is updated |
| `playlist.deleted` | A playlist is deleted |

**`playlist.deleted` data:**

```json
{ "id": "abc123" }
```

---

### Schedule Events

| Event | When |
|-------|------|
| `schedule.created` | A schedule entry is created |
| `schedule.updated` | A schedule entry is updated |
| `schedule.deleted` | A schedule entry is deleted |
| `schedule.triggered` | A schedule's window opens and AutoDJ starts |
| `schedule.ended` | A schedule's window closes and AutoDJ stops |
| `schedule.skipped` | A schedule was supposed to start but couldn't (playlist empty, etc.) |

**`schedule.triggered` data:**

```json
{
  "schedule_id": "def456",
  "name": "Morning Show",
  "mount": "/radio",
  "playlist_id": "abc123",
  "mode": "sequential"
}
```

**`schedule.skipped` data:**

```json
{
  "schedule_id": "def456",
  "name": "Morning Show",
  "mount": "/radio",
  "reason": "no playlist tracks present in library"
}
```

## API Reference

All endpoints require `Authorization: Bearer <api_key>`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/webhooks` | List webhooks |
| `POST` | `/api/webhooks` | Create webhook |
| `GET` | `/api/webhooks/:id` | Get webhook |
| `PATCH` | `/api/webhooks/:id` | Update webhook |
| `DELETE` | `/api/webhooks/:id` | Delete webhook |
