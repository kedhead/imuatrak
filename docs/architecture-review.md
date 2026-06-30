# ImuaTrak — Architecture Review

> Senior-engineer reverse-engineering pass over the whole repo (mobile app,
> Cloud Functions, web viewer, watch bridges). Read-only analysis — **no
> runtime behaviour was changed**. Code snippets below are illustrative
> targets, not applied diffs.

---

## 1. Reverse-engineered architecture

ImuaTrak is an **outrigger-paddling fitness tracker**. It's actually four
deployables sharing one Firebase backend:

| Surface | Tech | Lives in | Role |
|---|---|---|---|
| Phone app | Expo SDK 56 / RN 0.85 / expo-router | `app/`, `src/` | Source of truth: record, store, sync, export |
| Cloud Functions | Firebase Functions v2 | `firebase/functions/` | Weather proxy, Apple sign-in, FCM, counters, session↔event linking, account deletion |
| Web | Next.js (App Router) on Vercel | `web/` | Marketing + public session viewer + club dashboard |
| Watch companions | Swift / Kotlin (native, Phase 2) | `apple-watch/`, `wear/`, `modules/*-bridge` | Ship finished sessions to the phone |

### Layering inside the phone app

```
app/  (expo-router screens — presentation only)
  └─ subscribes to ──┐
src/services/ (the real application layer)
  recorder.ts ──────── orchestrator (Zustand store + module-level buffers)
   ├─ location.ts ──── expo-location background task → GpsSample
   ├─ motion.ts ────── expo-sensors 50 Hz → stroke-detector.ts → Stroke
   ├─ aggregator.ts ── pure: totals / splits / hrSummary
   ├─ geo.ts ───────── pure: haversine, downsample
   ├─ gpx.ts ───────── pure: Session → GPX 1.1
   ├─ storage.ts ───── FileSystem JSON+GPX under documentDirectory/sessions/{id}
   ├─ health.ts ────── Android Health Connect (no-op iOS)
   └─ sync.ts ──────── Firestore doc + Storage GPX, public-copy toggle
  clubService.ts ───── ~40 Firestore CRUD calls (clubs/events/posts/chat)
  clubStore.ts / settings.ts / subscriptionStore.ts  (Zustand stores)
  firebase.ts / auth.ts  (SDK init + auth flows)
src/models/  (canonical TS types — the schema contract)
src/ui/  (design system: theme, gradients, formatters, charts)
```

### The one data flow that matters: record → save → sync

```
start()
  requestPermissions → health.requestAuthorization → set isRecording
  location.subscribe(cb)  ──┐ each GPS tick: push TrackPoint, recompute totals, set store
  motion.subscribe(cb)    ──┤ each stroke:  strokeCount++, set store
  location.startBackgroundUpdates()
  setInterval(1s)         ──┘ advance the live timer
stopAndSave()
  cleanup() → aggregator.totals/splits/hrSummary → downsample(track,200)
  fetchWeather (callable, 6s race) → assemble Session
  storage.save(session, track)      // JSON + JSON + GPX to disk
  health.writePaddlingWorkout()     // best-effort, fire-and-forget
  syncSession(session)              // Firestore first, then GPX to Storage
on session create (Cloud Function): linkSessionsToEvent fans the id into overlapping club events
```

The **phone is authoritative**; watches and the web read/observe but the phone
owns writes. That's a clean, defensible core.

---

## 2. Critical problem areas (ranked — these are latent defects, not style)

These are ordered by blast radius. Each is a behaviour bug today; fixing them
*does* change functionality, so they're called out for a decision rather than
silently patched.

### C1 — `linkSessionsToEvent` uses two range filters → query always throws
`firebase/functions/src/index.ts`

```ts
.where("startAt", "<=", endedAt)
.where("endAt",   ">=", startedAt)   // ← second inequality field
```

Firestore **forbids inequality/range filters on more than one field** in a
single query. This query throws `FAILED_PRECONDITION` at runtime, so
**session→event auto-linking has never worked**, and there's no composite
index defined for it either. Correct shape: pin one bound server-side and
filter the other in memory.

```ts
// Events that could overlap: startAt <= session.endedAt, then filter endAt in JS
const snap = await db.collection(`clubs/${clubId}/events`)
  .where("startAt", "<=", endedAt)
  .orderBy("startAt", "desc")
  .limit(20)
  .get();
const overlapping = snap.docs.filter(d => (d.data().endAt as string) >= startedAt);
```

### C2 — Channel chat shows the *oldest* 60 messages, forever
`src/services/clubService.ts` → `subscribeChannelMessages`

```ts
orderBy("createdAt", "asc"), limit(msgLimit)   // first 60 ever, not latest 60
```

Once a channel passes 60 messages, new messages never appear in the live
listener. The fix is to fetch the newest descending, then reverse for display:

```ts
const q = query(coll, orderBy("createdAt", "desc"), limit(msgLimit));
return onSnapshot(q, (snap) => {
  const msgs = snap.docs.map(d => ({ ...(d.data() as Omit<ClubMessage,"id">), id: d.id }));
  onUpdate(msgs.reverse());          // oldest→newest for the UI
});
```

### C3 — `memberCount` is double-counted on every join
Client `joinClub`/`createClub` increment `memberCount`, **and** the
`onMemberJoin` Function increments it again on member-doc create. The code
comment claims `FieldValue.increment` is "idempotent" — it isn't; two
increments add two. A freshly created club shows **2** members (owner doc
creation fires the trigger on top of `memberCount: 1`). Pick **one** writer —
the trigger is the right one (atomic, server-side) — and drop the client
increments.

### C4 — Heart rate is in the schema but never recorded on the phone
`recorder.ts` builds every `TrackPoint` from GPS only; `hr` is never set.
Therefore `aggregator.hrSummary` always returns empty and every split's
`avgHr` is `0`. HR zones render as a dead feature. Either wire a live HR
source (HealthKit/Health Connect/BLE) into the track, or hide the HR UI until
Phase 2. Today it's schema surface area with no producer.

### C5 — Channel media uploads are blocked by Storage rules
`clubService.uploadMessageMedia` writes to
`clubs/{clubId}/channels/{channelId}/messages/{messageId}/media.ext`, but
`storage.rules` only grants writes to `clubs/{clubId}/messages/{messageId}/{file}`
(the legacy path, no `channels/` segment). Photo/video messages fail the
security check. Add a matching rule for the channel path.

### C6 — `migrateMessagesToGeneralChannel` is a destructive op behind a callable
It's a one-time migration callable by any club owner, with no
already-migrated guard and no idempotency key. Re-running re-copies/clobbers.
Gate it behind a `migrations/{clubId}` marker doc or remove it once run.

---

## 3. Bad architecture decisions

- **Mixed state model in `recorder.ts`.** Live stats live in a Zustand store
  *and* the hot data (`track`, `strokeCount`, `lastStrokeRate`, `sessionId`,
  unsub handles) lives in **module-level mutable singletons**. Two sources of
  truth for one session, untestable in isolation, and impossible to run two
  recorders or reset cleanly. The track buffer should be store/instance state,
  not file-scope `let`s.

- **`O(n²)` recompute on the GPS hot path.** Every 1 Hz tick calls
  `aggregator.totals(track, …)`, which re-haversines the **entire** track from
  index 0. A 90-minute paddle (~5400 points) does ~14.6M cumulative distance
  ops just to update the live "distance" label. Keep a running `distanceMeters`
  accumulator and add only the new leg per tick.

- **Schema duplicated three ways with drift.** `src/models/index.ts`,
  `web/lib/types.ts`, and `web/lib/clubTypes.ts` are hand-copied. They've
  **already diverged**: `PostType` is `"announcement"|"post"|"poll"` on mobile
  but `"announcement"|"post"` on web; web `Club` drops `sport`,
  `subscriptionRenewsAt`. A shared type is the contract for disk + Firestore +
  watch handoff — divergence here is a data-corruption vector.

- **No repository/abstraction boundary over Firestore.** `clubService.ts` is
  711 lines of direct SDK calls, collection-path string literals repeated
  dozens of times (`doc(db,"clubs",clubId,"channels",channelId,…)`). One
  path-shape change is a find-and-replace across the file. Centralise path
  builders.

- **Hardcoded bucket name.** `uploadMessageMedia` hardcodes
  `"imuatrak.firebasestorage.app"` while `firebase.ts` carefully *derives* the
  bucket. Two sources of truth for the same value; a project rename breaks
  uploads silently.

- **Auth listeners wired in two places.** `app/_layout.tsx` and
  `app/(tabs)/index.tsx` both call `watchAuth(...)`. The home tab re-uploads
  **every** local session on every auth callback (and the listener is created
  in a `useEffect([])` with no dep on the recorder). Sync-on-login belongs in
  one place behind a dedup guard.

---

## 4. Duplicate logic

| Duplicated thing | Locations | Note |
|---|---|---|
| Session/Totals/Split/HR types | `src/models`, `web/lib/types.ts` | already drifting |
| Club/Event/Post types | `src/models/club.ts`, `web/lib/clubTypes.ts` | `PostType` drift |
| `formatDuration` / `formatPace` / `formatKm` | `src/ui/format.ts`, `web/lib/format.ts` | byte-identical |
| `lastMessageAt` write | `clubService.sendMessage` **and** `onChannelMessageCreate` | written twice |
| `memberCount` increment | client + `onMemberJoin` | see C3 |
| Firestore path literals | throughout `clubService.ts` | ~40 repeats |
| Deprecated `formatKm`/`formatPace` kept beside replacements | `src/ui/format.ts` | dead-ish code |

---

## 5. Performance bottlenecks

1. **`storage.list()` reads full tracks to render summary cards.** Home and
   Stats tabs call `list()`, which reads `session.json` **and** the entire
   `track.json` for every session, then throws the track away (the cards only
   use `session.totals`). With 100 sessions × thousands of points each, that's
   tens of MB of JSON parsed on every tab focus. Split into `listSummaries()`
   (session.json only) vs `load(id)` (full track on demand).
2. **`O(n²)` live totals** (section 3).
3. **`useFocusEffect(reload)` re-reads everything from disk on every focus** —
   no in-memory cache, no `synced` index (the field is hardcoded `false`), so
   sign-in re-uploads the entire local library each time.
4. **`onChannelMessageCreate` N+1 reads.** For each recipient it reads
   `channelPreferences` then `fcmTokens` serially-ish; a big public channel
   does 2× member-count Firestore reads per message. Fan-out is fine but should
   batch-read tokens and short-circuit muted users earlier.

---

## 6. Scalability risks

- **Whole library held in memory & on the client.** All history lives in
  `documentDirectory` and is loaded wholesale; there's no pagination, no
  windowing, no archival. Fine at 50 sessions, painful at 2,000.
- **`getClubMembers` / `getClubBySlug` are unbounded / unindexed scans.**
  `getClubMembers` pulls the entire members subcollection; a 300-paddler club
  loads 300 docs to show a roster. `getClubBySlug` does a `where slug ==`
  with no composite index entry beyond the default.
- **`deleteAccount` doesn't remove Storage objects** (GPX tracks, club media)
  or `publicSessions/*` copies — orphaned data accrues and is a privacy/GDPR
  gap given it's the *account deletion* path.
- **`fetchWeather` has no caching/rate-limit;** every saved session hits
  OpenWeather twice. At scale that's a per-user cost multiplier and a quota
  risk on the shared key.
- **Single Firestore index defined.** Most `orderBy`+`where` queries
  (events by `startAt`/`endAt`, posts by `createdAt`) rely on
  single-field indexes; the moment a composite is needed (e.g. C1) it 500s in
  prod.

---

## 7. Maintainability issues

- **846-line `club.tsx` and 721-line `event/[id].tsx` screens** mix data
  fetching, business rules, and presentation. No hooks layer
  (`useClubFeed`, `useEvent`) — every screen re-implements load/refresh.
- **Pervasive empty `catch {}`** swallows errors with no telemetry. There's
  **one** `console.*` in the entire `app/`+`src/` tree; failures (sync, upload,
  weather, FCM) vanish silently, which will make field debugging miserable.
- **`require("react-native-health-connect")` inline** dodges typing and bundler
  analysis; fine as a guard but should be a typed dynamic import wrapper.
- **No tests beyond `stroke-detector`.** The aggregator (the thing that
  computes every number users see) and the GPX serializer are pure and trivial
  to test, yet untested.
- **`nanoidLite` rolls its own id** with `Math.random()` — not collision-safe
  at volume and not the `expo-crypto` randomness already imported elsewhere.

---

## 8. Clean architecture target

Introduce two thin seams that the current code is missing — a **typed schema
package** and a **data-access layer** — without disturbing the (good) service
orchestration.

```
packages/schema/        ← single source of truth for ALL types + zod validators
  consumed by: app, functions, web   (path alias or published workspace)

src/services/
  recorder.ts           ← orchestration only; track buffer becomes instance state
  paddling/
    metrics.ts          ← pure aggregator (running accumulators)
    gpx.ts
  data/
    paths.ts            ← every Firestore path built here, typed
    sessionRepo.ts      ← save/list-summary/load/sync (hides FileSystem+Firestore)
    clubRepo.ts         ← clubs/events/posts/chat (replaces clubService god-file)
  hooks/
    useClubFeed.ts, useEvent.ts, useSessions.ts   ← screens consume these
```

The web app and Functions import the **same** `packages/schema`, killing the
three-way type drift and the format-util copies.

---

## 9. Refactoring strategy (incremental, low-risk first)

**Phase 0 — correctness (ship behind review, these change behaviour):**
C1 query fix, C2 chat ordering, C3 single memberCount writer, C5 storage rule,
C6 migration guard. Each is a few lines and independently testable.

**Phase 1 — kill duplication (zero behaviour change):**
Create `packages/schema` (or a `shared/` dir with a tsconfig path alias),
move `Session`/club types + `format*` there, re-export from `src/models` and
`web/lib` so imports don't churn. Delete the drifted copies.

**Phase 2 — performance (behaviour-preserving):**
- `storage.listSummaries()` reading only `session.json`; point Home/Stats at it.
- Running-accumulator totals in the recorder hot path (keep `aggregator.totals`
  for the final authoritative compute at stop).
- A `sync-index.json` so `synced` is real and login stops re-uploading
  everything.

**Phase 3 — structure:**
Extract `sessionRepo`/`clubRepo` + `paths.ts`; lift screen data-loading into
hooks; add a tiny `logger` wrapping the empty catches with breadcrumbs.

**Phase 4 — tests & guards:**
Unit-test `aggregator` and `gpx`; add Firestore composite indexes for every
`where`+`orderBy` pair; add Storage-object + publicSession cleanup to
`deleteAccount`.

---

## 10. Improved production-grade code (targets)

### 10.1 Recorder hot path — O(1) per tick, single state owner

```ts
// metrics.ts — incremental distance, no full re-scan
export interface RunningTotals { distanceMeters: number; maxSpeedMps: number; elevationGainM: number; }

export function extendTotals(prev: RunningTotals, a: TrackPoint, b: TrackPoint): RunningTotals {
  const leg = haversineMeters(a.lat, a.lon, b.lat, b.lon);
  const rise = b.altM - a.altM;
  return {
    distanceMeters: prev.distanceMeters + leg,
    maxSpeedMps: Math.max(prev.maxSpeedMps, b.speedMps),
    elevationGainM: prev.elevationGainM + (rise > 0 ? rise : 0),
  };
}
```

```ts
// recorder.ts — track + running totals as instance state, updated per leg
unsubLocation = location.subscribe((s) => {
  const tSec = (s.tEpochMs - get().startedAtMs) / 1000;
  const point: TrackPoint = { t: tSec, lat: s.lat, lon: s.lon, altM: s.altM,
    speedMps: s.speedMps, ...(lastStrokeRate > 0 ? { strokeRate: lastStrokeRate } : {}) };
  const prev = track[track.length - 1];
  track.push(point);
  if (prev) running = extendTotals(running, prev, point);   // O(1), not O(n)
  set({ durationSec: tSec, distanceMeters: running.distanceMeters,
        currentSpeedMps: s.speedMps, strokeCount });
});
// stopAndSave still calls aggregator.totals(track, …) once for the authoritative record.
```

### 10.2 Summary-only listing — stop reading tracks to draw cards

```ts
// storage.ts
export interface SessionSummary { session: Session; synced: boolean; }

export async function listSummaries(): Promise<SessionSummary[]> {
  const root = await ensureRoot();
  const ids = await FileSystem.readDirectoryAsync(root).catch(() => [] as string[]);
  const index = await readSyncIndex();                       // { [id]: true }
  const out: SessionSummary[] = [];
  for (const id of ids) {
    try {
      const sj = await FileSystem.readAsStringAsync(`${root}${id}/session.json`);
      out.push({ session: JSON.parse(sj) as Session, synced: index[id] === true });
    } catch { /* skip malformed dir */ }
  }
  return out.sort((a, b) => (a.session.startedAt > b.session.startedAt ? -1 : 1));
}
```

### 10.3 Centralised Firestore paths (replaces literals in `clubService`)

```ts
// data/paths.ts
export const paths = {
  club: (c: string) => ["clubs", c] as const,
  members: (c: string) => ["clubs", c, "members"] as const,
  channelMsgs: (c: string, ch: string) => ["clubs", c, "channels", ch, "messages"] as const,
  publicSession: (id: string) => ["publicSessions", id] as const,
};
// usage: doc(db, ...paths.channelMsgs(clubId, channelId), messageId)
```

### 10.4 Shared schema (kills 3-way drift)

```ts
// packages/schema/session.ts  ← imported by app, web, functions
export const SCHEMA_VERSION = 1;
export type CraftType = "OC1"|"OC2"|"OC6"|"V1"|"SUP"|"SURFSKI"|"OTHER";
export interface Session { /* …the single canonical definition… */ }
// web/lib/types.ts becomes:  export * from "@imuatrak/schema/session";
```

### 10.5 Observability seam for the empty catches

```ts
// logger.ts
export const logger = {
  warn(scope: string, err: unknown, ctx?: Record<string, unknown>) {
    if (__DEV__) console.warn(`[${scope}]`, err, ctx);
    // TODO: forward to Crashlytics/Sentry in release builds
  },
};
// sync.ts:  } catch (e) { logger.warn("sync.gpx", e, { id: session.id }); }
```

---

## 11. What's genuinely good (keep it)

- **Pure, deterministic core** — `stroke-detector`, `aggregator`, `geo`, `gpx`
  are side-effect-free and reproducible; that's exactly right for cross-platform
  parity with the watches.
- **Sensible privacy posture** — weather key proxied server-side, audio
  on-device-only by design, public copies are denormalized/minimal.
- **Best-effort-by-default sync** — Firestore-first then Storage, fire-and-forget
  health export, idempotent `syncSession` — the offline story is thought through.
- **Security rules are mostly tight and role-aware** — the channel/private-DM
  logic in `firestore.rules` is careful; the gaps are in *Storage* rules (C5),
  not Firestore.

---

*Scope note: this review changes no runtime behaviour. The Phase-0 items in
§9 are real defects but altering them changes functionality, so they're
documented for an explicit go/no-go rather than applied here.*
