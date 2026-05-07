import { getApp, getApps, initializeApp } from "firebase/app";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import type { DashboardSession, PublicSession } from "./types";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(config);
export const db = getFirestore(firebaseApp);

/** Read a public session (no auth required). */
export async function getPublicSession(id: string): Promise<PublicSession | null> {
  const snap = await getDoc(doc(db, "publicSessions", id));
  if (!snap.exists()) return null;
  return snap.data() as PublicSession;
}

/** Read all sessions for an authenticated user, newest first. */
export async function getUserSessions(uid: string): Promise<DashboardSession[]> {
  const q = query(
    collection(db, "users", uid, "sessions"),
    orderBy("startedAt", "desc"),
    limit(200),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as DashboardSession);
}

/** Read a single session for an authenticated user. */
export async function getUserSession(
  uid: string,
  id: string,
): Promise<DashboardSession | null> {
  const snap = await getDoc(doc(db, "users", uid, "sessions", id));
  if (!snap.exists()) return null;
  return { ...snap.data(), id: snap.id } as DashboardSession;
}

/**
 * Toggle a session's public visibility. Mirrors the logic in the mobile
 * sync.ts: writes/removes the denormalized publicSessions/{id} copy.
 */
export async function setSessionPublic(
  uid: string,
  session: DashboardSession,
  isPublic: boolean,
): Promise<void> {
  const privateRef = doc(db, "users", uid, "sessions", session.id);
  await updateDoc(privateRef, { isPublic });

  const publicRef = doc(db, "publicSessions", session.id);
  if (isPublic) {
    await setDoc(publicRef, { ...session, userId: uid, isPublic: true });
  } else {
    await deleteDoc(publicRef).catch(() => undefined);
  }
}
