# ImuaTrak architecture

## Goals

1. One TypeScript codebase for both phones, native sub-projects for watches.
2. Phone is the source of truth for cloud sync; watches transfer finished
   sessions to the phone, and the phone uploads.
3. Identical session output across iOS and Android — same fields, same
   metric definitions, same GPX shape — see `data-model.md`.
4. Privacy-by-default: audio for "hut" detection is processed on-device only,
   never uploaded.

## Component overview

```
┌──────────────┐   WatchConnectivity   ┌─────────────────────┐   Firestore   ┌──────────────┐
│ Apple Watch  │ ────────────────────▶ │                     │ ────────────▶ │              │
│  (native)    │                       │ Expo phone app      │               │   Firebase   │
└──────────────┘                       │ (iOS + Android,     │               │   Firestore  │
                                       │  one TS codebase)   │               │   Storage    │
┌──────────────┐    Wearable Data API  │                     │               │   Functions  │
│ Wear OS      │ ────────────────────▶ │                     │               │              │
│  (native)    │                       └─────────────────────┘               └──────────────┘
└──────────────┘
```

## Recording pipeline (phone, Phase 1)

Implemented in `src/services/`:

1. `recorder.ts` orchestrates a session. On `start()` it spawns:
   - `location.ts` — `expo-location` background updates (1 Hz, high accuracy)
   - `motion.ts` — `expo-sensors` accelerometer at 50 Hz, fed into `stroke-detector.ts`
2. Each tick the recorder appends a `TrackPoint` to an in-memory buffer and
   exposes a Zustand store the live UI subscribes to.
3. On `stopAndSave()` the recorder computes totals/splits/HR-zones via
   `aggregator.ts`, persists the session to disk via `storage.ts` (JSON +
   GPX in `FileSystem.documentDirectory/sessions/{id}/`), then triggers
   `sync.ts` to push to Firebase (Storage GPX + Firestore session doc).

## Watch ↔ phone handoff (Phase 2)

The watch sub-projects live outside the Expo source tree because they're
native (Apple Watch is Swift-only, Wear OS works best in Kotlin):

- **Apple Watch** (`targets/ImuaTrakWatch/`): SwiftUI app using
  `HKWorkoutSession`, generated as an embedded watchOS target by the
  `@bacons/apple-targets` config plugin (see `docs/apple-watch-setup.md`).
  When signed in (token inherited from the phone, or native Sign in with
  Apple on the watch) it syncs sessions **directly to Firestore** over
  cellular via the watch's own Firebase SDK. Otherwise it falls back to
  sending session JSON to the phone via `WCSession.transferFile`; the Expo
  app's native WatchConnectivity bridge surfaces those files to JS and routes
  them through the same `sync.ts` path.
- **Wear OS** (`wear/`): Compose for Wear app using `HealthServicesClient`.
  Sends finished sessions through `Wearable.DataClient`; the Android
  side of the Expo bridge picks them up.

The Expo app remains the source of truth on the phone. The bridge lives
in a small Expo config plugin (`plugins/with-watch-bridge`).

## Audio "hut" detection (Phase 3)

- Runs only when the user opts in.
- Custom TensorFlow Lite audio classifier shipped as native modules on
  both platforms (no Expo Go support — requires a development build).
- 0.5 s window, 50% overlap, ~16 kHz mono. Emits a `SideSwitchEvent` when
  class confidence > 0.8 for ≥ 2 consecutive windows.
- Raw audio buffers are never written to disk and never leave the device.

## Privacy & permissions

| Permission             | Why                                  | Plugin / package                       |
|------------------------|--------------------------------------|---------------------------------------|
| Location (always)      | Track route, pace, distance          | `expo-location`                        |
| Motion / sensors       | Stroke rate detection                | `expo-sensors`                         |
| HealthKit / Connect    | HR + write workout                   | `react-native-health(-connect)`        |
| Microphone (opt-in)    | "Hut" detection                      | `expo-av` permission API               |
| Background fetch       | Continue recording when screen off   | `expo-task-manager`                    |

## Marketing site & public session viewer (`web/`)

A small Next.js 15 app deployed to Vercel at <https://imuatrak.app>:

- `/` — landing page (features, download CTA, contact).
- `/s/{sessionId}` — public viewer for sessions the owner has flipped
  "Share publicly" on. Reads `publicSessions/{sessionId}` server-side
  via the Firebase web SDK (anonymous reads allowed by `firestore.rules`),
  renders the route on Leaflet + OSM tiles plus stats and splits.

The full GPX track stays in private storage even when sharing — the
public viewer uses the polyline `trackSummary` baked into the doc.

## Out-of-scope for v1

Live remote tracking, social feed, training plans, direct OAuth uploads to
Strava/Garmin (manual GPX upload covers this for v1), and standalone
watch apps (Phase 5).
