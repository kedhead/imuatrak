# ImuaTrak for Garmin (Connect IQ)

Connect IQ watch app for modern Garmin GPS watches that records a paddle
session — GPS, heart rate, 25 Hz accelerometer stroke detection (same
algorithm as the phone app), pause/resume — writes a normal FIT activity so
the paddle lands in Garmin Connect, and uploads the ImuaTrak session to the
backend over HTTPS.

## Architecture

```
ImuaTrakApp        AppBase; owns the Uploader, flushes the queue on launch
  PreRecordView    craft picker (OC1…SURFSKI), pairing state, START
  RecordingView    time / distance / pace / stroke rate / HR, pause + stop
  SummaryView      totals, and whether the session uploaded or queued

WorkoutManager   ActivityRecording FIT session (SPORT_ROWING) + a stroke_rate
                 developer field; Position.LOCATION_CONTINUOUS; 25 Hz
                 accelerometer → StrokeDetector; 1 Hz track sampling
StrokeDetector   port of src/services/stroke-detector.ts, re-tuned for 25 Hz
Aggregator       port of src/services/aggregator.ts — totals, HR zones, splits
SessionBuilder   builds the dict that mirrors src/models/index.ts
Uploader         POST to the garminIngest Cloud Function; queue + retry
```

### Why this one doesn't use a phone bridge

The Apple Watch app talks to the phone over WatchConnectivity and the Wear OS
app over the Wearable Data Layer, both received by a native module
(`modules/watch-bridge`, `modules/wear-bridge`). Connect IQ has no equivalent
that a React Native app can listen on without embedding Garmin's Connect IQ
Mobile SDK on both platforms, so the watch instead POSTs the session straight
to `garminIngest` (`firebase/functions/src/garmin.ts`), tunnelled through
Garmin Connect Mobile's connection, and the phone pulls it back down from
Firestore (`pullGarminSessions()` in `src/services/garmin.ts`).

Consequences worth knowing:

- Sessions land even with the ImuaTrak phone app closed or uninstalled.
- Uploading needs Garmin Connect Mobile connected and the phone online. It
  usually isn't, mid-paddle — so an upload that can't go through is queued in
  `Application.Storage` (max 5) and retried on the next app launch.
- The watch is unauthenticated, hence the pairing flow below.

### Pairing

ImuaTrak → Settings → Data → **Pair a Garmin watch** mints a 6-digit code.
In Garmin Connect Mobile: Connect IQ Store → My Device → ImuaTrak → Settings →
**Pairing code**. On its first upload the watch trades the code for a
long-lived token, stores it, and clears the code field. Re-entering a code
later replaces the token, so moving the watch to another account works.

Only the token's SHA-256 is stored server-side, and the code expires after 15
minutes.

## Track resolution

A Connect IQ app has far less memory than the Wear app, which keeps every fix
and downsamples once at the end. Here the track is capped at 300 points: when
it fills, it is halved in place and the sampling interval doubles. A one-hour
paddle is sampled every 2 s, a four-hour paddle every 8 s, and memory is flat
either way. The FIT activity Garmin Connect receives is full resolution
regardless — the cap only affects the ImuaTrak copy.

## Stroke detection at 25 Hz

`registerSensorDataListener` caps at 25 Hz on these devices; the phone and Wear
apps run the detector at 50 Hz. Both filter coefficients are per-sample, so
they are squared through for the halved rate (0.97 → 0.9409, 0.25 → 0.4375).
`src/services/__tests__/stroke-detector.test.ts` pins the two rates against
each other — if you change the detector on the phone, that test tells you what
the Monkey C constants have to become.

## Building

```bash
# once: generate a developer key (keep it out of the repo)
openssl genrsa -out developer_key.pem 4096
openssl pkcs8 -topk8 -inform PEM -outform DER -in developer_key.pem \
        -out developer_key.der -nocrypt

export EXPO_PUBLIC_FIREBASE_PROJECT_ID=…      # same value as the phone app
./build.sh                       # debug .prg for the fenix7 simulator
./build.sh --device venu3
./build.sh --store               # .iq package for the Connect IQ Store
```

`build.sh` builds from a copy under `build/src` after substituting the Firebase
project id and app version into `resources/strings/strings.xml`, so the
placeholders stay in git. Without `EXPO_PUBLIC_FIREBASE_PROJECT_ID` the app
still records and queues; it just never uploads.

Run it in the simulator with `connectiq` (starts the simulator) then
`monkeydo build/imuatrak.prg fenix7`. Simulation → Activity Data lets you play
a FIT file through it, which is the only way to exercise GPS, HR and the
accelerometer without going paddling.

## CI

`.github/workflows/garmin.yml` builds on every push touching `garmin/`, but it
is `workflow_dispatch` + manual by design: the Connect IQ SDK is behind a
Garmin licence click-through and cannot be fetched unattended, so the workflow
expects a `CONNECT_IQ_SDK_URL` repo variable pointing at a mirror your team
controls, plus `GARMIN_DEVELOPER_KEY_BASE64`. Without them it skips and says
so, the same way `wear.yml` skips its release steps without a keystore.

## Checking the backend half

The watch's counterpart is `garminIngest` in `firebase/functions/src/garmin.ts`.
It has a standalone check that runs the whole ingest path — pairing, token
upload, replay, validation, rate limiting — against in-memory Firestore and
Storage stubs, with no emulator and no credentials:

```bash
cd firebase/functions && npm run check:garmin
```

Run it after changing either side of the payload shape.

## Sideloading onto a real watch

1. Build a `.prg` for the exact device (`./build.sh --device fenix7`).
2. Connect the watch by USB; it mounts as a drive.
3. Copy the `.prg` to `GARMIN/APPS/` on the watch.
4. Eject, then find ImuaTrak in the activity list.

## Status / known limitations

- **The Monkey C in this directory has never been compiled.** The Connect IQ
  SDK is not obtainable in the environment this was written in — Garmin's
  download host is unreachable from it — so treat a first `./build.sh` as part
  of the work, not a formality.
- Craft type is recorded in the session and in the FIT activity name, but every
  craft maps to `SPORT_ROWING`: FIT has no outrigger sport, and rowing is what
  Garmin Connect renders sensibly for all of them.
- No weather. The phone and Wear apps call the `fetchWeather` function at the
  end of a session; the same call from the watch is possible but would double
  the number of round trips through Garmin Connect Mobile, which is the least
  reliable link in the chain. Weather is optional in the schema.
- No side-switch ("hut") detection — it is audio-based and phone-only.
- Devices are limited to those in `manifest.xml`. Older watches (fenix 5,
  FR235, vivoactive 3) are excluded deliberately: they lack the memory for the
  track buffer plus the detector.
