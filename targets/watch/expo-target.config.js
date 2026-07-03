/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "watch",
  name: "ImuaTrakWatch",
  displayName: "ImuaTrak",
  bundleIdentifier: "app.imuatrak.watchkitapp",
  // watchOS 10 keeps Series 4/5/SE1 supported. HKQuantityType(.distancePaddleSports)
  // is watchOS 11+ and is #available-guarded in WorkoutManager.swift.
  deploymentTarget: "10.0",
  icon: "../../assets/icon.png",
  frameworks: [
    "SwiftUI",
    "WatchKit",
    "HealthKit",
    "CoreMotion",
    "CoreLocation",
    "WatchConnectivity",
    "MapKit",
    "AppIntents",
  ],
  entitlements: {
    "com.apple.developer.healthkit": true,
  },
};
