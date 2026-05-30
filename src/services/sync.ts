import * as FileSystem from "expo-file-system/legacy";
import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import type { Session } from "@/models";
import { auth, db, storage } from "./firebase";
import { gpxUriFor } from "./storage";

/**
 * Upload a finished session document and its GPX track. Idempotent — safe
 * to retry on the same id. Throws if the user is signed out.
 */
export async function syncSession(session: Session): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("not signed in");

  const path = `users/${user.uid}/tracks/${session.id}.gpx`;
  const gpxString = await FileSystem.readAsStringAsync(gpxUriFor(session.id));
  const gpxBytes = new TextEncoder().encode(gpxString);
  const r = ref(storage, path);
  await uploadBytes(r, gpxBytes, { contentType: "application/gpx+xml" });

  const docRef = doc(db, "users", user.uid, "sessions", session.id);
  await setDoc(docRef, { ...session, userId: user.uid, trackStoragePath: path });
}

/**
 * Toggle a session's public visibility. When made public we write a
 * denormalized copy to the top-level `publicSessions/{id}` collection
 * (anyone-readable, see firestore.rules). The full-resolution GPX track
 * stays in private user storage — the public viewer uses the polyline
 * `trackSummary` baked into the doc, which is enough for a route preview.
 */
export async function setSessionPublic(session: Session, isPublic: boolean): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("not signed in");
  if (session.userId !== user.uid) throw new Error("not your session");

  // Update the private source-of-truth doc
  const privateRef = doc(db, "users", user.uid, "sessions", session.id);
  await setDoc(privateRef, { ...session, isPublic }, { merge: true });

  // Write or remove the public copy
  const publicRef = doc(db, "publicSessions", session.id);
  if (isPublic) {
    await setDoc(publicRef, { ...session, userId: user.uid, isPublic: true });
  } else {
    await deleteDoc(publicRef).catch(() => undefined);
  }
}
