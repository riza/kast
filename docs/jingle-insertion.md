# Jingle / Ad Insertion

Kast can automatically insert short audio clips — jingles, station IDs, ads — into an AutoDJ stream without interrupting the main playlist. Insertion is configured per mount.

## How It Works

You designate a playlist as the **jingle pool** for a mount. Kast picks tracks from this pool sequentially (cycling) and inserts them between regular playlist tracks whenever a trigger fires. Two triggers are available and both can be active simultaneously — whichever fires first wins, and both counters reset after each insertion.

| Trigger | Fires when |
|---------|-----------|
| **Every N tracks** | `N` regular tracks have played since the last jingle |
| **Every N minutes** | `N` minutes have elapsed since the last jingle |

Setting both means "insert after N tracks **or** N minutes, whichever comes first."

## Configuration

**Dashboard:** Open a mount → **Jingle Insertion**. Select a jingle playlist and set the frequency values. Leave both at 0 to disable.

**API** (via mount update):

```http
PATCH /api/mounts/:name
Authorization: Bearer <api_key>
Content-Type: application/json

{
  "jingle_playlist_id": "abc123",
  "jingle_every_tracks": 3,
  "jingle_every_minutes": 0
}
```

To disable insertion set both counts to 0 or clear `jingle_playlist_id`.

## Jingle Playlist

Any existing playlist can serve as the jingle pool. Only tracks present in the media library are eligible — missing paths are silently skipped. If the pool is empty after resolution, insertion is disabled for that session.

Tracks are played in a sequential cycle through the pool, starting at a random offset on each session start.

## Interaction with Scheduled Playlists

Jingle configuration is read from the mount at session-start time. When a [scheduled playlist](scheduled-playlists.md) activates a mount, it inherits the mount's current jingle settings.

## Webhook Events

Kast emits a webhook event each time a jingle plays. Webhooks with an empty events list (all events) will receive it; it is not yet subscribable by name.

```json
{
  "event": "autodj.jingle.played",
  "data": {
    "mount": "/radio",
    "id": 7,
    "title": "Station ID",
    "artist": "KAST FM",
    "duration_ms": 8000
  }
}
```
