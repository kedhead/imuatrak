# Club calendar feed

A public, read-only feed of a club's events (practices/races/socials) so an
external website or a personal calendar app can show the schedule and keep it
up to date automatically. Shipped 2026-08.

Used by the 9th Island Outrigger team site (`9thislandoutrigger.com`, a separate
repo) to render the schedule from ImuaTrak with no re-entry.

## Endpoint

Cloud Function `clubCalendar` — `firebase/functions/src/index.ts`.

```
GET https://us-central1-imuatrak.cloudfunctions.net/clubCalendar?club={id-or-slug}
GET https://us-central1-imuatrak.cloudfunctions.net/clubCalendar?club={id-or-slug}&format=json
```

- `club` accepts either the club **document ID** (the value in an invite link,
  `imuatrak.app/join/{id}`) or its **slug**. The ID is tried first, since that's
  what a club owner can actually see.
- Default response is **iCalendar** (`text/calendar`) for calendar subscriptions.
- `format=json` returns JSON for a site to fetch and render in its own design.

Runs with the Admin SDK, so it reads events past the member-only Firestore rule
— the feed is **intentionally public / link-accessible** (agreed with the owner).
No auth. Open CORS (`Access-Control-Allow-Origin: *`). `Cache-Control: max-age=300`
(≈5 min). Returns events from **60 days ago forward**, sorted by `startAt`
ascending, capped at **500**.

## JSON shape

```json
{
  "club": "9th Island Outrigger",
  "events": [
    {
      "id": "NfJMacREtMgSRCbCGf6N",
      "title": "Evening Practice",
      "type": "practice",                     // "practice" | "race" | "social" | null
      "startAt": "2026-08-21T01:00:00.000Z",  // ISO 8601 UTC
      "endAt":   "2026-08-21T02:30:00.000Z",  // ISO 8601 UTC or null
      "location": "Lake Mead Marina",         // string, "" or null
      "meetTime": "8am",                      // string, "" or null
      "description": null                      // string, "" or null
    }
  ]
}
```

Consumer notes:
- Convert `startAt`/`endAt` from **UTC to local** for display.
- `location`, `meetTime`, `description` come back as **either `""` or `null`**
  when unset — treat both as "not set" (don't render an empty "Meet: " label).
- Read-only. Event editing stays in the ImuaTrak app (or the ImuaTrak web
  dashboard); the feed just mirrors whatever is scheduled.

## Deploy

Automatic: `.github/workflows/firebase.yml` deploys functions on every push to
`main` that touches `firebase/**`. Declares no secrets, so it deploys alongside
the existing functions (the parked `revenuecat.ts` billing functions are
unaffected). Cache means edits appear in the feed within ~5 minutes.
