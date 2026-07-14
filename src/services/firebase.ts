import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth, initializeAuth, type Auth } from "firebase/auth";
// getReactNativePersistence ships in Firebase's React Native build but isn't in
// the bundled `firebase/auth` type declarations (a known upstream gap); Metro
// resolves the real function at runtime on native.
// @ts-ignore
import { getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const cfg = (Constants.expoConfig?.extra?.firebase ?? {}) as Partial<FirebaseOptions>;

if (!cfg.apiKey || !cfg.projectId) {
  // Soft warning so the UI still renders in dev before .env is filled in.
  // eslint-disable-next-line no-console
  console.warn(
    "[imuatrak] Firebase config missing. Set EXPO_PUBLIC_FIREBASE_* in .env to enable sign-in and sync.",
  );
}

/**
 * Resolve the Storage bucket explicitly. Projects created in the last year+
 * use the `<project>.firebasestorage.app` bucket domain, but the Firebase JS
 * SDK still guesses `<project>.appspot.com` when no bucket is configured —
 * which points at a bucket that doesn't exist and makes every upload fail.
 * So: use the configured bucket if present, otherwise derive the modern one.
 */
const projectId = cfg.projectId ?? "stub";
const storageBucket =
  cfg.storageBucket && cfg.storageBucket.length > 0
    ? cfg.storageBucket
    : `${projectId}.firebasestorage.app`;

export const firebaseApp = getApps().length
  ? getApp()
  : initializeApp({
      apiKey: cfg.apiKey ?? "stub",
      authDomain: cfg.authDomain,
      projectId,
      storageBucket,
      appId: cfg.appId,
    });

// Persist the auth session across app restarts so signed-in users stay signed
// in (the whole point of "remember me"). getAuth() alone uses in-memory
// persistence on React Native, logging users out every cold start.
function makeAuth(): Auth {
  if (Platform.OS === "web") {
    // Web uses the SDK's default (browser local) persistence.
    return getAuth(firebaseApp);
  }
  try {
    return initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Already initialized (e.g. Fast Refresh) — reuse the existing instance,
    // which already has AsyncStorage persistence configured.
    return getAuth(firebaseApp);
  }
}

export const auth = makeAuth();
export const db = getFirestore(firebaseApp);
// Pass the bucket explicitly so we never fall back to the SDK's wrong guess.
export const storage = getStorage(firebaseApp, `gs://${storageBucket}`);
export const functions = getFunctions(firebaseApp);
