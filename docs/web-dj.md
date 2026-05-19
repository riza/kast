# Web DJ (WHIP Ingress)

> **Planned feature** — not yet implemented.

Web DJ will let broadcasters go live directly from a browser tab — no external software like OBS or BUTT required. It uses the **WHIP** (WebRTC HTTP Ingress Protocol) standard for ingest and bridges the audio into the existing HLS pipeline.

## Current Live Source Options

Kast already supports two live source methods:

| Method | Protocol | Tool examples |
|--------|----------|---------------|
| Icecast-compatible PUT | HTTP chunked audio | OBS, BUTT, Liquidsoap |
| WHEP egress | WebRTC (outbound only) | Any WHEP player |

Web DJ adds a third: **WHIP ingress** (WebRTC inbound from browser).

## Planned Flow

```
Browser mic/audio
       ↓  (WebRTC / WHIP)
  Kast WHIP endpoint
       ↓  (PCM pipe)
  HLS segmenter
       ↓  (HLS)
  Listeners
```

1. The broadcaster opens the Web DJ page in their browser.
2. The browser requests mic access and sends audio to Kast via WHIP signaling (`POST /whip/{mount}`).
3. Kast feeds the received WebRTC audio stream into the HLS segmenter for the mount.
4. Listeners receive the stream as normal HLS — no change on the listener side.

## Planned Endpoint

```http
POST /whip/{mount}
Content-Type: application/sdp

<SDP offer>
```

Response: `201 Created` with an SDP answer and a `Location` header pointing to the session resource.

## Relation to Existing Features

- **Scheduled playlists** — a live Web DJ session will preempt a scheduled playlist for the duration of the broadcast, similar to how a manual Icecast source works today.
- **Webhooks** — `mount.status.changed` will fire when the WHIP session starts and ends.
- **WHEP egress** — WHEP (outbound WebRTC to listeners) is already supported and will continue to work alongside WHIP ingress.

## Related

- [README — Live Source Input](../README.md#features)
- [Webhooks](webhooks.md)
