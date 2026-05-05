# Paddleup data model

This document is the canonical schema for `Session` documents in Firestore and
the JSON exchanged between phone, watch, and Cloud Functions. Both the iOS and
Android clients MUST produce documents that conform to this shape so a session
recorded on one platform renders correctly on the other.

## Storage layout

```
Firestore:
  users/{uid}                                 — UserProfile
  users/{uid}/sessions/{sessionId}            — Session (summary, owner-only)
  publicSessions/{sessionId}                  — Denormalized copy of sessions
                                                where isPublic == true.
                                                Anyone-readable; powers the
                                                paddleup.app/s/{id} pages.

Cloud Storage:
  users/{uid}/tracks/{sessionId}.gpx          — Full GPX track (private)
  users/{uid}/tracks/{sessionId}.fit          — Optional FIT export (private)
  users/{uid}/cards/{sessionId}.png           — Rendered share card (server-generated)
```

The full GPX never leaves private storage even when a session is shared
publicly — the public viewer renders the route from the `trackSummary`
polyline (≤ 200 points) baked into the doc.

The full per-second track is **not** stored in Firestore (cost + size). The
Session document carries a downsampled `trackSummary` (≤ 200 points) used to
render the home/list map preview. The full track lives in Cloud Storage as GPX.

## UserProfile

```json
{
  "id": "string (uid)",
  "displayName": "string",
  "createdAt": "ISO-8601 timestamp",
  "units": "metric | imperial",
  "hrZones": {
    "restBpm": 60,
    "maxBpm": 190,
    "zones": [120, 140, 160, 175, 185]
  },
  "defaultCraft": "OC1 | OC2 | OC6 | V1 | SUP | SURFSKI | OTHER"
}
```

## Session

```json
{
  "id": "string",
  "userId": "string",
  "schemaVersion": 1,
  "source": "ios-phone | ios-watch | android-phone | android-wear",
  "appVersion": "string",
  "craftType": "OC1 | OC2 | OC6 | V1 | SUP | SURFSKI | OTHER",
  "startedAt": "ISO-8601 timestamp",
  "endedAt": "ISO-8601 timestamp",

  "totals": {
    "distanceMeters": 0,
    "durationSec": 0,
    "movingDurationSec": 0,
    "avgPaceSecPerKm": 0,
    "avgSpeedMps": 0,
    "maxSpeedMps": 0,
    "strokeCount": 0,
    "avgStrokeRate": 0,
    "calories": 0,
    "elevationGainM": 0
  },

  "hr": {
    "avg": 0,
    "max": 0,
    "zones": [
      { "zone": 1, "minBpm": 0, "maxBpm": 119, "timeSec": 0 },
      { "zone": 2, "minBpm": 120, "maxBpm": 139, "timeSec": 0 },
      { "zone": 3, "minBpm": 140, "maxBpm": 159, "timeSec": 0 },
      { "zone": 4, "minBpm": 160, "maxBpm": 174, "timeSec": 0 },
      { "zone": 5, "minBpm": 175, "maxBpm": 999, "timeSec": 0 }
    ]
  },

  "splits": [
    {
      "index": 1,
      "distanceM": 1000,
      "durationSec": 360,
      "avgHr": 152,
      "avgStrokeRate": 62,
      "avgSpeedMps": 2.78
    }
  ],

  "sideSwitches": [
    {
      "tSec": 73.5,
      "detectedSide": "L | R",
      "confidence": 0.86,
      "source": "audio | manual"
    }
  ],

  "weather": {
    "start": { "windMps": 4.2, "windDeg": 270, "gustMps": 6.8, "airTempC": 22.0, "pressureHpa": 1013.0, "conditions": "Partly Cloudy" },
    "samples": [
      { "tSec": 0, "windMps": 4.2, "windDeg": 270, "gustMps": 6.8, "airTempC": 22.0, "pressureHpa": 1013.0 }
    ]
  },

  "trackSummary": [
    { "t": 0, "lat": 21.2756, "lon": -157.8295, "altM": 1.2, "speedMps": 2.6 }
  ],

  "trackStoragePath": "users/{uid}/tracks/{sessionId}.gpx",
  "fitStoragePath":   "users/{uid}/tracks/{sessionId}.fit",
  "cardStoragePath":  "users/{uid}/cards/{sessionId}.png",

  "isPublic": false
}
```

`isPublic` defaults to `false`. When the user toggles "Share publicly"
on in the app, the client writes a denormalized copy of this document
to `publicSessions/{sessionId}` (anyone-readable) and sets `isPublic:
true` on the private doc. Toggling off removes the public copy.

## Track point (full resolution, in GPX file)

Per-second samples encoded as GPX 1.1 trackpoints with extensions:

```xml
<trkpt lat="21.2756" lon="-157.8295">
  <ele>1.2</ele>
  <time>2026-04-28T14:03:21Z</time>
  <extensions>
    <ns3:TrackPointExtension>
      <ns3:hr>148</ns3:hr>
      <ns3:cad>62</ns3:cad>
    </ns3:TrackPointExtension>
    <pu:speed>2.6</pu:speed>
    <pu:cadConfidence>0.92</pu:cadConfidence>
  </extensions>
</trkpt>
```

`pu:` is the Paddleup namespace `http://paddleup.app/xmlschemas/v1`.

## Validation rules

- `endedAt > startedAt`.
- `totals.distanceMeters >= 0`, `totals.durationSec > 0` for a saved session.
- `splits[i].index` is 1-based and contiguous.
- `sideSwitches[i].tSec` strictly increasing.
- `hr.zones` length is exactly 5; coverage is the closed interval
  `[zones[0].minBpm, zones[4].maxBpm]`.
- `trackSummary.length <= 200`.

## Versioning

`schemaVersion` increments on any breaking change. Clients must reject sessions
with a higher `schemaVersion` than they understand and prompt the user to
update.
