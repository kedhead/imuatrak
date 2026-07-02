# ImuaTrak

> *Imua* — Hawaiian for "charge forward".

Outrigger canoe paddling fitness app for iPhone and Android (with watch
support arriving in Phase 2). Records GPS, heart rate, stroke rate, splits,
weather, and audio-detected side switches ("huts") for OC1, OC2, OC6, V1,
SUP, and surfski sessions. Sessions sync to Firebase, export to Android
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

The Apple Watch app lives in `targets/watch/` (SwiftUI, standalone GPS +
heart rate) and is embedded into every iOS build automatically by
`@bacons/apple-targets` — see `targets/watch/README.md` for the one-time
EAS credentials setup. Finished watch sessions transfer to the phone via
WatchConnectivity and sync through the normal pipeline. `wear/` holds a
Wear OS (Kotlin) skeleton that is not yet buildable or shipped. The phone
remains the source of truth. See `docs/architecture.md`.

## Roadmap

- **Phase 1** — Phone vertical slice: record, save, sync, export GPX, write to Health.
- **Phase 2** — Companion watch apps (Apple Watch + Wear OS).
- **Phase 3** — Audio "hut" detection for side switches (custom TF Lite module).
- **Phase 4** — Weather capture, social share card, third-party uploaders.
- **Phase 5** — Standalone watch apps (record without the phone).
