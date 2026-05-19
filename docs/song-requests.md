# Song Requests

> **Planned feature** — not yet implemented.

The song request system will let listeners ask for a specific track to be played next, without giving them full control over the queue.

## Planned Behaviour

Listeners submit a request via the public API (no authentication). The server places the requested track into the AutoDJ queue for that mount. The track plays once after the current track finishes, then normal playlist rotation resumes.

### Planned Endpoint

```http
POST /public/{mount}/request
Content-Type: application/json

{ "track_id": 42 }
```

Response:

```json
{
  "status": "queued",
  "position": 2,
  "track": {
    "id": 42,
    "title": "Blue Monday",
    "artist": "New Order"
  }
}
```

## Design Notes

- **Per-mount toggle** — requests will be opt-in; disabled by default.
- **Duplicate suppression** — the same track cannot be queued more than once at a time.
- **Cooldown** — a configurable per-track cooldown prevents the same track from being requested again too soon.
- **Rate limiting** — per-IP request limits to prevent abuse.
- **Queue cap** — maximum queue depth to prevent large backlogs.

Moderation (approve/reject before queueing) is under consideration but not part of the initial design.

## Related

- [AutoDJ](../README.md#features) — queue management overview
- [Webhooks](webhooks.md) — `autodj.track.changed` fires when a requested track begins playing
