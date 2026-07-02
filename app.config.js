/** @type {import('expo/config').ExpoConfig} */
const config = {
  name: "ImuaTrak",
  slug: "imuatrak",
  owner: "paintpile",
  scheme: "imuatrak",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#07314F",
  },
  newArchEnabled: true,
  assetBundlePatterns: ["**/*"],

  // EAS Update (over-the-air JS updates). The runtime version ties an OTA
  // update to compatible native builds; JS-only fixes can ship without a
  // rebuild via `eas update`. Builds must be made AFTER this is configured
  // for the app to start checking for updates.
  runtimeVersion: { policy: "appVersion" },
  updates: {
    url: "https://u.expo.dev/e23de54c-0b38-4c19-b13f-066535bcdd14",
  },

  ios: {
    bundleIdentifier: "app.imuatrak",
    // Apple Developer Team ID — required by @bacons/apple-targets to sign the
    // watch target. Set APPLE_TEAM_ID in EAS project env (and locally in .env
    // when running prebuild); find it at developer.apple.com → Membership.
    appleTeamId: process.env.APPLE_TEAM_ID,
    supportsTablet: false,
    infoPlist: {
      // Required on the companion iOS app because the bundled watch app uses
      // HealthKit (workout session + heart rate). The phone app itself does
      // not read or write HealthKit data.
      NSHealthShareUsageDescription:
        "The ImuaTrak Apple Watch app reads your heart rate during a paddling workout to show live effort and heart-rate zones.",
      NSHealthUpdateUsageDescription:
        "The ImuaTrak Apple Watch app saves your paddling workouts, distance, and calories to Health.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "ImuaTrak uses your location to record your route, distance, and pace while you paddle.",
      NSLocationWhenInUseUsageDescription:
        "ImuaTrak uses your location to record your route, distance, and pace while you paddle.",
      NSMotionUsageDescription:
        "ImuaTrak uses motion sensors to count strokes and measure stroke rate.",
      // NSMicrophoneUsageDescription intentionally omitted: the audio "hut"
      // detection feature (Phase 3) is not implemented yet, so declaring the
      // microphone permission would request access for an absent feature
      // (App Store Guideline 5.1.1 / 2.5.1). Restore it when Phase 3 ships.
      // Only "location" is declared — the app records GPS in the background
      // while a session is active. "fetch" was removed: no Background Fetch /
      // BGTaskScheduler feature exists, and declaring it triggered the
      // "no feature requires this background mode" rejection (Guideline 2.1).
      UIBackgroundModes: ["location"],
    },
    entitlements: {
      "com.apple.developer.applesignin": ["Default"],
      "aps-environment": "production",
    },
    config: {
      usesNonExemptEncryption: false,
    },
  },

  android: {
    package: "app.imuatrak",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#07314F",
    },
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY,
      },
    },
    permissions: [
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
      "WAKE_LOCK",
      "BODY_SENSORS",
      "HIGH_SAMPLING_RATE_SENSORS",
      "ACTIVITY_RECOGNITION",
      // RECORD_AUDIO removed alongside iOS NSMicrophoneUsageDescription — the
      // audio "hut" detection feature (Phase 3) is not built yet. Restore when
      // it ships.
      "POST_NOTIFICATIONS",
      "com.google.android.wearable.permission.RECEIVE_COMPLICATION_DATA",
    ],
  },

  web: {
    bundler: "metro",
    output: "single",
  },

  plugins: [
    "expo-router",
    "expo-notifications",
    [
      "react-native-google-mobile-ads",
      {
        androidAppId: process.env.ADMOB_ANDROID_APP_ID ?? "ca-app-pub-3940256099942544~3347511713",
        iosAppId: process.env.ADMOB_IOS_APP_ID ?? "ca-app-pub-3940256099942544~1458002511",
      },
    ],
    "expo-apple-authentication",
    "expo-secure-store",
    [
      "expo-tracking-transparency",
      {
        userTrackingPermission:
          "ImuaTrak asks so it can show ads that are more relevant to you. Decline and you'll still see ads — just non-personalized ones.",
      },
    ],
    "./plugins/withFixGradle",
    "./plugins/withWatchBridge",
    // Must stay BEFORE @bacons/apple-targets: mods run in reverse registration
    // order, and the targets plugin registers the pbxproj provider last.
    "./plugins/withWatchVersionSync",
    // Embeds targets/watch (the ImuaTrakWatch watchOS app) into the Xcode
    // project on every prebuild, so EAS builds ship the watch app.
    "@bacons/apple-targets",
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission:
          "ImuaTrak uses your location to record your route, distance, and pace while you paddle.",
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
      },
    ],
    [
      "expo-build-properties",
      {
        ios: { deploymentTarget: "16.4" },
        android: { compileSdkVersion: 36, targetSdkVersion: 35, minSdkVersion: 26 },
      },
    ],
  ],

  extra: {
    eas: {
      projectId: "e23de54c-0b38-4c19-b13f-066535bcdd14",
    },
    firebase: {
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    },
  },

  experiments: {
    typedRoutes: true,
  },
};

module.exports = config;
