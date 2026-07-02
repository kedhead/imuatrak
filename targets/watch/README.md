# ImuaTrak Apple Watch app

SwiftUI watchOS app (single-target, watchOS 10+) that records paddle
sessions — HKWorkoutSession (`.paddleSports`) + GPS + 50 Hz accelerometer
stroke detection — and ships finished sessions to the iPhone over
WatchConnectivity.

## How it's built

The target is embedded **automatically** by
[`@bacons/apple-targets`](https://github.com/EvanBacon/expo-apple-targets)
on every `expo prebuild` / EAS build — no manual Xcode setup. The pieces:

- `expo-target.config.js` — target definition (bundle ID
  `app.imuatrak.watchkitapp`, watchOS 10.0, HealthKit entitlement, frameworks).
- `Info.plist` — `WKApplication` + HealthKit/location usage strings (the
  watch app crashes at HealthKit authorization without these).
- `plugins/withWatchVersionSync.js` — keeps the watch `MARKETING_VERSION`
  equal to the phone app version (App Store validation requires a match).
- `plugins/withWatchBridge.js` — injects `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
  into `Services/WeatherService.swift` at prebuild, and adds the phone-side
  WatchBridge receiver pod.
- `app.config.js` `ios.appleTeamId` (from `APPLE_TEAM_ID` env) — required
  for signing the second target.

## One-time credentials setup (before the first CI build)

EAS must create a provisioning profile for `app.imuatrak.watchkitapp` (with
the HealthKit capability). The GitHub Actions build runs `--non-interactive`
and cannot do this. Run once from a terminal:

```bash
eas credentials -p ios        # or: eas build -p ios --profile preview
```

and let EAS register the watch bundle ID + profile. If the build later fails
on a missing HealthKit capability, enable it manually on the
`app.imuatrak.watchkitapp` identifier at developer.apple.com.

## Data flow

Sessions are saved on the watch at `Documents/sessions/{id}/session.json` +
`track.json` (same JSON schema as `src/models`), then queued via
`WCSession.transferFile`. The phone's WatchBridge pod (see
`modules/watch-bridge/`) writes them into the app's session store and emits
`sessionReceived`; the Home tab listener syncs them to Firebase.

## Known limitations

- Weather fetch from the watch always returns nil today: the `fetchWeather`
  Cloud Function requires Firebase auth and the watch is unauthenticated.
  Harmless (weather is optional); fix later by relaying via the phone.
- The live-map route polyline is stubbed (`MapPolylineOverlay` renders
  nothing); only the current-position marker shows.
- `distancePaddleSports` HealthKit samples require watchOS 11+; on watchOS
  10 the workout still records without that quantity type.
