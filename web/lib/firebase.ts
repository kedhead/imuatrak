import { getApp, getApps, initializeApp } from "firebase/app";
import { doc, getDoc, getFirestore } from "firebase/firestore";
import type { PublicSession } from "./types";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(config);
export const db = getFirestore(firebaseApp);

/**
 * Fetch a public session by id. Reads from `publicSessions/{id}`, which
 * is anyone-readable per `firestore.rules`. Returns null if the session
 * doesn't exist or the owner has un-shared it.
 */
export async function getPublicSession(id: string): Promise<PublicSession | null> {
  const snap = await getDoc(doc(db, "publicSessions", id));
  if (!snap.exists()) return null;
  return snap.data() as PublicSession;
}
