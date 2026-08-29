# ImuaTrak

> *Imua* — Hawaiian for "charge forward".

Outrigger canoe paddling fitness app for iPhone and Android, with watch apps
for Apple Watch, Wear OS and Garmin. Records GPS, heart rate, stroke rate,
splits, weather, and audio-detected side switches ("huts") for OC1, OC2, OC6,
V1, SUP, and surfski sessions. Sessions sync to Firebase, export to Android
Health Connect, and export to GPX/FIT for upload to Strava, Garmin
Connect, etc.

## Stack

- **Expo SDK 53** + React Native + TypeScript
- **expo-router** for file-system routing
- **Firebase JS SDK** (Auth, Firestore, Storage, Functions)
- **expo-location** + **expo-task-manager** for background GPS
- **expo-sensors** for accelerometer-based stroke detection
- **react-native-health** + **react-native-health-connect** for native health stores
- **react-native-maps** for the route map

## Repository layout

```
app/         expo-router routes (screens)
src/         models, services, hooks, UI components
assets/      icons, splash, fonts
firebase/    Firestore + Storage rules and Cloud Functions
web/         Next.js marketing site + public session viewer (deployed on Vercel)
docs/        Canonical data model and architecture notes
```

## Prerequisites

- Node 20+
- `npm i -g eas-cli` (cloud builds — needed for iOS until you have a Mac)
- A Firebase project (Auth, Firestore, Storage, Functions enabled)
- For local Android dev: Android Studio + an emulator or a device
- For iOS: a Mac with Xcode 16, **or** EAS Build (no Mac required)

## First-time setup

```bash
npm install
cp .env.example .env       # then fill in your Firebase web-app config
```

For the route map on Android you'll also need a **Google Maps SDK for
Android** API key (from Google Cloud Console → APIs → Credentials). Add it
to `.env` as `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY`. iOS uses Apple Maps and
doesn't need any key.

Most things you can run today on Android from Linux. Background location,
Health Connect, and Sign in with Apple need a development
build (not Expo Go):

```bash
eas build --profile development --platform android
# install the resulting .apk on your device, then:
npx expo start --dev-client
```

When the Mac arrives, the same `eas build --profile development --platform ios`
gets you the iOS dev build. No project config changes required.

## Watch path

Three watch apps, each native to its platform:

- **Apple Watch** — `targets/watch/` (SwiftUI), embedded into every iOS build
  automatically by `@bacons/apple-targets`. See `targets/watch/README.md` for
  the one-time EAS credentials setup. Sessions transfer over WatchConnectivity.
- **Wear OS** — `wear/` (Kotlin/Compose), built by `.github/workflows/wear.yml`
  and shipped on the Play Store Wear OS track. Sessions transfer over the
  Wearable Data Layer.
- **Garmin** — `garmin/` (Connect IQ / Monkey C). Connect IQ has no bridge a
  React Native app can receive on, so the watch uploads straight to the
  `garminIngest` Cloud Function and the phone pulls the session back down from
  Firestore. Pairing is a 6-digit code from Settings → Data. See
  `garmin/README.md`.

Both bridged watches route received sessions through the normal `sync.ts`
pipeline. The phone remains the source of truth. See `docs/architecture.md`.

## Roadmap

- **Phase 1** — Phone vertical slice: record, save, sync, export GPX, write to Health.
- **Phase 2** — Companion watch apps (Apple Watch + Wear OS).
- **Phase 3** — Audio "hut" detection for side switches (custom TF Lite module).
- **Phase 4** — Weather capture, social share card, third-party uploaders.
- **Phase 5** — Standalone watch apps (record without the phone).
