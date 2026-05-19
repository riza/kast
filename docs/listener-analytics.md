# Listener Analytics

> **Planned feature** — not yet implemented.

Kast currently tracks live listener counts in memory (visible on the dashboard and via the `listener.count.changed` webhook). The analytics feature will persist these counts as a time series so you can view historical trends.

## Current State

Live counts are available now:

```http
GET /api/mounts/{name}
```

```json
{ "name": "/radio", "listeners": 14, ... }
```

The `listener.count.changed` [webhook event](webhooks.md) fires whenever the count changes, which can be used to build your own time-series store in the interim.

## Planned Features

### Persistent Time Series

Listener counts will be written to SQLite on every sweep cycle (currently every ~30 seconds). Data will be retained for a configurable period (default: 30 days).

### Planned API

```http
GET /public/{mount}/analytics?from=2024-11-01T00:00:00Z&to=2024-11-01T23:59:59Z&resolution=1h
```

```json
{
  "mount": "/radio",
  "from": "2024-11-01T00:00:00Z",
  "to": "2024-11-01T23:59:59Z",
  "resolution": "1h",
  "points": [
    { "ts": "2024-11-01T08:00:00Z", "listeners": 4 },
    { "ts": "2024-11-01T09:00:00Z", "listeners": 12 }
  ]
}
```

### Dashboard Charts

The mount detail page will show a listener count chart for the last 24 hours, 7 days, and 30 days.

## Related

- [Webhooks](webhooks.md) — `listener.count.changed` for real-time listener tracking
