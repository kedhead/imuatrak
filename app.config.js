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
    supportsTablet: false,
    infoPlist: {
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "ImuaTrak uses your location to record your route, distance, and pace while you paddle.",
      NSLocationWhenInUseUsageDescription:
        "ImuaTrak uses your location to record your route, distance, and pace while you paddle.",
      NSMotionUsageDescription:
        "ImuaTrak uses motion sensors to count strokes and measure stroke rate.",
      NSMicrophoneUsageDescription:
        "ImuaTrak listens for the steerer's 'hut' call to detect side switches. Audio is processed on-device only and never recorded.",
      NSUserTrackingUsageDescription:
        "ImuaTrak uses this to show relevant ads. You can remove ads entirely by subscribing to ImuaTrak+ or joining a paying club.",
      UIBackgroundModes: ["location", "fetch"],
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
      "RECORD_AUDIO",
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
    "./plugins/withFixGradle",
    "./plugins/withWatchBridge",
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
