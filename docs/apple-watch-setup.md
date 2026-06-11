# Apple Watch App — Setup

The watchOS target is now generated automatically by the `@bacons/apple-targets`
Expo config plugin — **no manual Xcode target creation**. All Swift sources live in
`Sources/` and are compiled into the `ImuaTrakWatch` target on every prebuild.

## How it's wired

- `apple-watch/expo-target.config.js` — declares the watchOS app target (bundle id
  `app.imuatrak.watchkitapp`, watchOS 9+), its frameworks, and entitlements.
- `apple-watch/Info.plist` / `apple-watch/ImuaTrakWatch.entitlements` — target
  Info.plist and entitlements (App Group `group.app.imuatrak`, HealthKit, Sign in
  with Apple, background modes).
- `plugins/withWatchFirebaseSPM.js` — attaches the Firebase Apple SDK
  (`FirebaseAuth` + `FirebaseFirestore`) to the watch target via Swift Package
  Manager and bundles `GoogleService-Info.plist`.
- `app.config.js` registers, in order: `@bacons/apple-targets` →
  `withWatchFirebaseSPM` → `withWatchBridge`. The phone app also declares the shared
  App Group so it can exchange settings/goals with the watch.

## Prerequisites

- Xcode 16+, an Apple Watch Series 4+ (or simulator), a developer account with
  HealthKit + Sign in with Apple capabilities.
- `apple-watch/GoogleService-Info.plist` — the watch's Firebase config (same project
  as `EXPO_PUBLIC_FIREBASE_PROJECT_ID`). **Gitignored**; provide it locally or as an
  EAS secret file. Without it, `FirebaseApp.configure()` on the watch will fail.

## Build

```bash
npm install
npx expo prebuild --platform ios   # generates ios/ incl. the ImuaTrakWatch target
```

Then build via Xcode (`ios/imuatrak.xcworkspace`, select the `ImuaTrakWatch` scheme)
or via EAS (`eas build --platform ios`). The first SPM resolve downloads the Firebase
packages.

## How sync works

- **Standalone (cellular watch, no phone):** once the watch is signed in (a token is
  pushed from the phone after sign-in, or the user signs in on the watch with Apple),
  `SyncManager` writes finished sessions **directly** to Firestore
  `users/{uid}/sessions/{id}`. Works over cellular with no phone present.
- **Tethered fallback:** if the watch isn't signed in or the direct write can't be
  confirmed, the session is queued for the iPhone via `WCSession.transferFile`; the
  phone's `WatchBridgeModule` receives it and calls `syncSession()`.
- **GPX:** the watch writes `trackSummary` to the doc immediately and forwards the
  full track to the phone, which builds and uploads the GPX when reachable.

## Auth paths

- **Inherit from phone:** after phone sign-in, the phone mints a custom token
  (`issueWatchToken` Cloud Function) and sends it over WatchConnectivity; the watch
  calls `signIn(withCustomToken:)` and then refreshes its own tokens.
- **Native on watch:** `AuthManager.startSignInWithApple()` runs Sign in with Apple
  on watchOS and exchanges the identity token via `mobileAppleSignIn` (which now
  accepts both the phone and watch bundle ids as audiences).

## Risks to validate on device / EAS

1. **Firebase SPM in the generated target** — `withWatchFirebaseSPM` patches the
   pbxproj each prebuild. If it can't reach the target, fall back to declaring
   Firebase for the watch via CocoaPods.
2. **Apple identity-token audience** — confirm whether the watch's token carries
   `app.imuatrak.watchkitapp` or the parent app id; the allow-list in
   `mobileAppleSignIn` covers both.
