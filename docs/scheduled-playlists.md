# Scheduled Playlists

Scheduled playlists let you define time windows during which AutoDJ automatically switches to a specific playlist on a mount — useful for morning shows, prime-time blocks, or overnight automation.

## How It Works

The schedule runner checks the current time every 5 seconds. When a schedule's window becomes active it starts AutoDJ with the configured playlist, replacing whatever was playing. When the window closes AutoDJ is stopped and the mount returns to idle (or the next active schedule, if any).

**Key behaviours:**

- **Latency** — activation and deactivation happen within ~5 seconds of the window boundary.
- **Resume support** — if Kast restarts during an active window, the runner re-adopts the running session without interrupting playback (if the same playlist is already playing).
- **No overlap** — two schedules may not share the same mount and overlapping time windows. Validation prevents this at creation time.
- **Ownership** — the runner only stops sessions it started. A manually-started AutoDJ session is left alone unless a schedule window opens and takes over.

## Creating a Schedule

**Dashboard:** Open a mount → **Schedules** → **Add Schedule**.

Fill in:

| Field | Description |
|-------|-------------|
| **Name** | Display label (e.g. "Morning Show") |
| **Playlist** | Which playlist to play |
| **Days** | One or more weekdays (Sun–Sat) |
| **Start / End time** | Local time range (uses the server timezone configured in `kast.toml`) |
| **Enabled** | Toggle without deleting the schedule |

**API:**

```http
POST /api/schedules
Authorization: Bearer <api_key>
Content-Type: application/json

{
  "name": "Morning Show",
  "mount": "/radio",
  "playlist_id": "abc123",
  "days": ["mon", "tue", "wed", "thu", "fri"],
  "start_time": "07:00",
  "end_time": "09:00",
  "enabled": true
}
```

## Timezone

Schedules run in the timezone set in `kast.toml`:

```toml
[server]
timezone = "Europe/Istanbul"
```

If `timezone` is omitted or invalid, UTC is used.

## Webhook Events

The schedule runner emits [webhook events](webhooks.md) as it manages sessions:

| Event | When |
|-------|------|
| `schedule.triggered` | Window opened; AutoDJ started |
| `schedule.ended` | Window closed; AutoDJ stopped |
| `schedule.skipped` | Window opened but AutoDJ couldn't start (playlist empty, etc.) |

## API Reference

All endpoints require `Authorization: Bearer <api_key>`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/schedules` | List all schedules |
| `POST` | `/api/schedules` | Create schedule |
| `GET` | `/api/schedules/:id` | Get schedule |
| `PUT` | `/api/schedules/:id` | Update schedule |
| `DELETE` | `/api/schedules/:id` | Delete schedule |
