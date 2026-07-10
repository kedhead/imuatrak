# ImuaTrak for Wear OS

Standalone Wear OS 3+ (API 30+) watch app that records paddle sessions —
Health Services exercise tracking (GPS + heart rate + speed), 50 Hz
accelerometer stroke detection (same algorithm as the phone app), pause/resume,
and automatic transfer of finished sessions to the phone app over the
Wearable Data Layer.

## Architecture

```
MainActivity (Compose for Wear OS)
  Start screen    → craft picker (OC1…SURFSKI), km/mi toggle, GO button
  Recording       → time / distance / pace / stroke rate / HR, pause + stop
  Summary         → totals, then back to start

ExerciseService (foreground service + OngoingActivity notification)
  keeps the process alive while the screen is off

WorkoutManager  — Health Services ExerciseClient (PADDLING) streams
                  LOCATION / HEART_RATE_BPM / SPEED; accelerometer → StrokeDetector
TransferManager — writes sessions/{id}/{session,track}.json, sends both files
                  to the phone via ChannelClient; `.sent` marker + retry of
                  unsent sessions on next app launch
```

The JSON schema mirrors `src/models/index.ts` exactly (see `models/Session.kt`),
so the phone app stores received files as-is. The phone-side receiver is
`modules/wear-bridge` (WearableListenerService → `sessionReceived` event → the
Home tab syncs to Firebase).

## Building

CI builds a debug APK on every push that touches `wear/`
(`.github/workflows/wear.yml`) — download the `imuatrak-wear-debug` artifact
from the Actions run. Locally: open `wear/` in Android Studio, or
`./gradlew assembleDebug` (JDK 17).

Optional: set `EXPO_PUBLIC_FIREBASE_PROJECT_ID` in the environment at build
time to enable the end-of-session weather fetch (same value as the phone app).

## Installing on a watch (beta / sideload)

1. On the watch: Settings → System → About → tap **Build number** 7× to enable
   developer options, then Developer options → **ADB debugging** + **Debug over
   Wi-Fi**. Note the IP shown (e.g. `192.168.1.42:5555`).
2. On a computer on the same Wi-Fi:
   ```
   adb pair <ip:pairing-port> <code>     # Wear OS 3+ shows a pairing dialog
   adb connect <ip:5555>
   adb install app-debug.apk
   ```
3. Launch **ImuaTrak** from the watch app list. Grant location + body sensors
   when prompted on first GO.

## Watch → phone sync: signature requirement

The Wearable Data Layer only connects watch/phone apps that share the **same
application ID and signing certificate**. This app already uses the phone's
application ID (`app.imuatrak`). For transfer to actually work:

- The tester must also have the ImuaTrak **Android phone app** installed, and
- both APKs must be signed with the **same key**. A debug-signed watch APK will
  not talk to the EAS-signed phone app. To sign a matching release build,
  download the EAS keystore (`eas credentials -p android` → Download), create
  `wear/keystore.properties`:
  ```
  storeFile=../imuatrak.jks
  storePassword=…
  keyAlias=…
  keyPassword=…
  ```
  and run `./gradlew assembleRelease`.

Without the phone app (or with mismatched signatures) the watch app still
works **standalone**: sessions record and are kept on the watch; unsent
sessions are re-sent automatically on a later app launch once a correctly
signed phone app is in range.
