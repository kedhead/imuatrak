/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "watch",
  name: "ImuaTrakWatch",
  displayName: "ImuaTrak",
  bundleIdentifier: "app.imuatrak.watchkitapp",
  // watchOS 10 keeps Series 4/5/SE1 supported. HKQuantityType(.distancePaddleSports)
  // is watchOS 11+ and is #available-guarded in WorkoutManager.swift.
  deploymentTarget: "10.0",
  // Own icon: the watch masks to a circle, so the logo sits smaller than on
  // the iPhone icon to keep the wordmark clear of the edge.
  icon: "../../assets/watch-icon.png",
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
