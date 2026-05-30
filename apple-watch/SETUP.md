# Apple Watch App — Setup Guide

All Swift source files are in `Sources/`. The Xcode project must be created manually since watchOS targets cannot be automated via Expo config plugins alone.

## Prerequisites
- Xcode 16+
- Apple Watch Series 4+ (or simulator)
- Developer account with HealthKit + WatchConnectivity entitlements

## Step 1 — Generate the iOS project
```bash
npx expo prebuild --platform ios
```
This creates `ios/imuatrak.xcworkspace`.

## Step 2 — Add the WatchKit App target in Xcode
1. Open `ios/imuatrak.xcworkspace`
2. **File → New → Target → watchOS → App**
3. Set:
   - Product Name: `ImuaTrakWatch`
   - Bundle ID: `app.imuatrak.watchkitapp`
   - Language: Swift, Interface: SwiftUI
   - Minimum Deployment: watchOS 9.0
4. When prompted "Activate scheme?", click **Activate**

## Step 3 — Add source files
Drag the entire `apple-watch/Sources/` folder into the **ImuaTrakWatch** target (not the phone target). Uncheck "Copy items if needed".

## Step 4 — Configure entitlements
In the `ImuaTrakWatch` target:
1. **Signing & Capabilities → + → HealthKit** (enable workouts)
2. **+ → App Groups** → add `group.app.imuatrak` (must match the phone app)
3. **+ → WatchConnectivity** is linked automatically via the `TransferManager.swift`

The **phone app target** (`imuatrak`) already has `group.app.imuatrak` via `app.config.js`.

## Step 5 — Fill in Firebase project ID
Edit `Sources/Services/WeatherService.swift` and replace:
```swift
static let projectId = "YOUR_FIREBASE_PROJECT_ID"
```
with your actual Firebase project ID (same value as `EXPO_PUBLIC_FIREBASE_PROJECT_ID`).

## Step 6 — Build
Select the **ImuaTrakWatch** scheme and build on a real device (weather API requires network; map requires location).

## Architecture Notes
- Sessions are saved locally on the watch as `Documents/sessions/{id}/session.json` + `track.json`
- On reconnect with the iPhone, `TransferManager` sends both files via `WCSession.transferFile`
- The phone's `WatchBridgeModule.swift` (added by `plugins/withWatchBridge.js`) receives the files, saves them to the same path structure as phone sessions, and emits `sessionReceived` to JS
- The home tab listener calls `syncSession()` to push to Firebase
