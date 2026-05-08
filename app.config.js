/** @type {import('expo/config').ExpoConfig} */
const config = {
  name: "ImuaTrak",
  slug: "imuatrak",
  scheme: "imuatrak",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#0E5FA5",
  },
  newArchEnabled: true,
  assetBundlePatterns: ["**/*"],

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
      NSHealthShareUsageDescription:
        "ImuaTrak reads your heart rate to show effort during paddling sessions.",
      NSHealthUpdateUsageDescription:
        "ImuaTrak writes finished paddling workouts to Apple Health.",
      NSMicrophoneUsageDescription:
        "ImuaTrak listens for the steerer’s “hut” call to detect side switches. Audio is processed on-device only and never recorded.",
      UIBackgroundModes: ["location", "fetch"],
    },
    entitlements: {
      "com.apple.developer.healthkit": true,
      "com.apple.developer.healthkit.access": [],
      "com.apple.developer.applesignin": ["Default"],
    },
    config: {
      usesNonExemptEncryption: false,
    },
  },

  android: {
    package: "app.imuatrak",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0E5FA5",
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
      "FOREGROUND_SERVICE_HEALTH",
      "WAKE_LOCK",
      "BODY_SENSORS",
      "HIGH_SAMPLING_RATE_SENSORS",
      "ACTIVITY_RECOGNITION",
      "RECORD_AUDIO",
      "POST_NOTIFICATIONS",
    ],
  },

  web: {
    bundler: "metro",
    output: "single",
  },

  plugins: [
    "expo-router",
    "expo-apple-authentication",
    "expo-secure-store",
    "./plugins/withFixGradle",
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
        ios: { deploymentTarget: "16.0" },
        android: { compileSdkVersion: 35, targetSdkVersion: 35, minSdkVersion: 26 },
      },
    ],
    // react-native-health is iOS-only (HealthKit); skip its plugin on Android
    ...(process.env.EAS_BUILD_PLATFORM !== "android"
      ? [
          [
            "react-native-health",
            {
              isClinicalDataEnabled: false,
              healthSharePermission:
                "ImuaTrak reads your heart rate to show effort during paddling sessions.",
              healthUpdatePermission:
                "ImuaTrak writes finished paddling workouts to Apple Health.",
            },
          ],
        ]
      : []),
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
