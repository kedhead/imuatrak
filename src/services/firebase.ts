import Constants from "expo-constants";
import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
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

export const firebaseApp = getApps().length
  ? getApp()
  : initializeApp({
      apiKey: cfg.apiKey ?? "stub",
      authDomain: cfg.authDomain,
      projectId: cfg.projectId ?? "stub",
      storageBucket: cfg.storageBucket,
      appId: cfg.appId,
    });

export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);
export const functions = getFunctions(firebaseApp);
