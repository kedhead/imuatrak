# Paddleup architecture

## Goals

1. Native, watch-first feel on both ecosystems — full standalone watch apps
   that record without the phone present.
2. Phone is the source of truth for cloud sync; watches transfer finished
   sessions to the phone, and the phone uploads.
3. Identical session output across iOS and Android — same fields, same
   metric definitions, same GPX shape — see `data-model.md`.
4. Privacy-by-default: audio for "hut" detection is processed on-device only,
   never uploaded.

## Component overview

```
┌──────────────┐   WatchConnectivity   ┌──────────────┐   Firestore   ┌──────────────┐
│ Apple Watch  │ ────────────────────▶ │  iPhone app  │ ────────────▶ │   Firebase   │
└──────────────┘                       └──────────────┘               │   Firestore  │
                                                                      │   Storage    │
┌──────────────┐    Wearable Data API  ┌──────────────┐               │   Functions  │
│ Wear OS      │ ────────────────────▶ │  Android app │ ────────────▶ │              │
└──────────────┘                       └──────────────┘               └──────────────┘
```

## Recording pipeline (phone, Phase 1)

1. `SessionRecorder` starts → spawns:
   - `LocationTracker` (CoreLocation / FusedLocationProvider) → 1 Hz GPS samples.
   - `MotionTracker` (CoreMotion / SensorManager) → 50 Hz accel + gyro to a
     `StrokeDetector` that emits stroke events.
   - `HeartRateSource` (HealthKit on iOS; on Android, deferred to Wear OS phase
     since most users will get HR from a watch).
2. Each tick, the recorder appends a `TrackPoint` to local persistence
   (Core Data on iOS, Room on Android) and updates a Combine/`StateFlow`
   stream that the `RecordView`/`RecordScreen` observes for live UI.
3. On stop, the recorder computes totals/splits/HR-zones and writes a finalized
   `Session` row.
4. `FirebaseSync` (background task / WorkManager) generates GPX, uploads
   `Session` doc to Firestore + GPX to Storage, marks the local row synced.

## Watch ↔ phone handoff (Phase 2)

- **Apple Watch:** `WCSession.transferFile` to send GPX, `transferUserInfo` for
  the small Session JSON. Phone reconstructs as if it had recorded locally and
  routes through the same `FirebaseSync`.
- **Wear OS:** `Wearable.DataClient` puts a session asset (zip of JSON+GPX)
  into the data layer; phone listens via `DataClient.OnDataChangedListener`.

## Audio "hut" detection (Phase 3)

- Runs only when the user opts in.
- iOS: `SoundAnalysis.SNAudioStreamAnalyzer` with a custom Create ML
  `MLSoundClassifier` model. 0.5 s window, 50% overlap.
- Android: TensorFlow Lite Audio Classifier with the converted `.tflite`
  model. 16 kHz mono via `AudioRecord`.
- Emits a `SideSwitchEvent { tSec, side, confidence }` whenever class
  confidence > 0.8 for ≥ 2 consecutive windows.
- Raw audio buffers are never written to disk and never leave the device.

## Privacy & permissions

| Permission             | Why                                  | Platform string                                 |
|------------------------|--------------------------------------|------------------------------------------------|
| Location (always)      | Track route, pace, distance          | `NSLocationAlwaysAndWhenInUseUsageDescription` |
| Motion                 | Stroke rate detection                | `NSMotionUsageDescription`                     |
| HealthKit read+write   | HR + write workout                   | `NSHealth(Share|Update)UsageDescription`       |
| Microphone (opt-in)    | "Hut" detection                      | `NSMicrophoneUsageDescription`                 |
| Foreground service     | Keep GPS alive on Android            | `FOREGROUND_SERVICE_LOCATION` manifest         |

## Out-of-scope for v1

Live remote tracking, social feed, training plans, direct OAuth uploads to
Strava/Garmin (manual GPX upload covers this for v1).
