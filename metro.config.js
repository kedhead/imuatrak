const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Required for Firebase JS SDK on RN: it ships some `.cjs` files that Metro
// needs to be told about explicitly.
config.resolver.sourceExts.push("cjs");

// Package exports stay ON (Metro's default). They were switched off here as a
// Firebase workaround, from a time when resolving through `exports` picked
// Firebase Auth's browser build and lost getReactNativePersistence. That no
// longer applies: @firebase/auth declares a `react-native` export condition,
// and the `firebase/auth` wrapper just re-exports it, so Metro lands on the
// React Native build either way (verified in the bundle).
//
// And it has to be on now: React Native 0.88 provides `react-native/setup-env`
// ONLY through its `exports` map (the file is src/setup-env.js). With exports
// off, Metro could not resolve it and every iOS and Android build failed at the
// JS bundling step after the SDK 58 upgrade.

module.exports = config;
