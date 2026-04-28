# Paddleup

Outrigger canoe paddling fitness app for iPhone, Android, Apple Watch, and Wear OS.

Records GPS, heart rate, stroke rate, splits, weather, and audio-detected side
switches ("huts") for OC1, OC2, OC6, V1, SUP, and surfski sessions. Sessions
sync to Firebase, write to Apple Health / Google Fit / Health Connect, and
export to GPX/FIT for upload to Strava, Garmin Connect, etc.

## Repository layout

```
ios/         Native iOS + watchOS (Swift / SwiftUI)
android/     Native Android + Wear OS (Kotlin / Compose)
firebase/    Firestore rules, Storage rules, Cloud Functions
docs/        Canonical data model and architecture notes
```

## Prerequisites

- **iOS:** macOS, Xcode 15+, an Apple Developer account (for HealthKit, WeatherKit, Sign in with Apple).
- **Android:** Android Studio Hedgehog or newer, JDK 17, Android SDK 35.
- **Firebase:** a Firebase project with Auth, Firestore, Storage, and Functions enabled. Install the Firebase CLI (`npm i -g firebase-tools`).

## First-time setup

1. Create a Firebase project and download:
   - `GoogleService-Info.plist` → `ios/Paddleup/`
   - `google-services.json` → `android/app/`
   Both files are gitignored.
2. Enable Sign in with Apple and Google as auth providers in Firebase.
3. Deploy rules: `cd firebase && firebase deploy --only firestore:rules,storage:rules`.

## Running

### iOS phone app
The Xcode project is generated from `ios/project.yml` using
[XcodeGen](https://github.com/yonaskolb/XcodeGen) so we don't have to commit
the `.xcodeproj` bundle. To build locally:

```
brew install xcodegen
cd ios && xcodegen generate
open Paddleup.xcodeproj
```

Select the `Paddleup` scheme and run on a device (HealthKit and CoreMotion
require a real device, not the simulator).

### Android phone app
```
cd android && ./gradlew :app:installDebug
```

### Apple Watch app
Select the `PaddleupWatch` scheme in Xcode and run on a paired Apple Watch
(Series 6 or later for standalone GPS).

### Wear OS app
```
cd android && ./gradlew :wear:installDebug
```

## Roadmap

- **Phase 1** — Phone vertical slice: record, save, sync, export GPX, write to Health.
- **Phase 2** — Standalone watch apps (Apple Watch + Wear OS).
- **Phase 3** — Audio "hut" detection for side switches.
- **Phase 4** — Weather capture, social share card, third-party uploaders.

See `/docs/architecture.md` and `/docs/data-model.md` for details.
