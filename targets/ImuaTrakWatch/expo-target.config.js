/**
 * expo-target.config.js — @bacons/apple-targets
 *
 * Declares the watchOS companion app target so `expo prebuild` / EAS generate
 * it automatically. apple-targets uses a file-system-synchronized group, so
 * every file in this directory (App/, Models/, Services/, Views/, plus
 * Info.plist, the .entitlements, and GoogleService-Info.plist) is included in
 * the ImuaTrakWatch target — no manual Xcode steps.
 *
 * Firebase (FirebaseAuth + FirebaseFirestore) is attached to this target via
 * the sibling `pods.rb`, which apple-targets' Podfile loader wires into a
 * `target 'ImuaTrakWatch'` block.
 */
module.exports = (config) => ({
  type: "watch",
  name: "ImuaTrakWatch",
  bundleIdentifier: "app.imuatrak.watchkitapp",
  deploymentTarget: "9.0",
  // Frameworks the watch app links against directly.
  frameworks: ["HealthKit", "CoreLocation", "CoreMotion", "WatchConnectivity", "AuthenticationServices"],
  // Entitlements + Info.plist are pulled from the sibling files in this folder.
  entitlements: {
    "com.apple.security.application-groups": ["group.app.imuatrak"],
    "com.apple.developer.healthkit": true,
    "com.apple.developer.healthkit.access": [],
    "com.apple.developer.applesignin": ["Default"],
  },
});
