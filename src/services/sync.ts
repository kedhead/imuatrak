import * as FileSystem from "expo-file-system/legacy";
import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { deleteObject, ref, uploadBytes } from "firebase/storage";
import { canActOnSession, isUnownedSession, type Session } from "@/models";
import { auth, db, storage } from "./firebase";
import { gpxUriFor, markSynced, remove as removeLocal, updateStoredSession } from "./storage";

/**
 * Give an owner-less session (watch transfer, or recorded before sign-in) to
 * the signed-in user on this device, so the local copy stops carrying "" or
 * "anonymous" — which made Share publicly fail with "not your session".
 */
async function stampLocalOwner(session: Session, uid: string): Promise<Session> {
  if (!isUnownedSession(session)) return session;
  const owned = { ...session, userId: uid };
  await updateStoredSession(owned).catch(() => undefined);
  return owned;
}

/**
 * Upload a finished session document and its GPX track. Idempotent — safe
 * to retry on the same id. Throws if the user is signed out.
 *
 * Firestore is written first so the session appears on the website immediately.
 * The GPX upload to Storage is best-effort and won't block or prevent the
 * Firestore write from succeeding.
 */
export async function syncSession(session: Session): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("not signed in");

  const docRef = doc(db, "users", user.uid, "sessions", session.id);
  await setDoc(docRef, { ...session, userId: user.uid });

  // The session is durably in Firestore — record that so sign-in re-sync
  // skips it. The GPX upload below stays best-effort and doesn't gate this.
  await markSynced(session.id).catch(() => undefined);
  // Watch sessions arrive with userId "" and the cloud copy above now has
  // the real uid; bring the copy on this phone in line too.
  await stampLocalOwner(session, user.uid);

  try {
    const path = `users/${user.uid}/tracks/${session.id}.gpx`;
    const gpxString = await FileSystem.readAsStringAsync(gpxUriFor(session.id));
    const gpxBytes = new TextEncoder().encode(gpxString);
    const r = ref(storage, path);
    await uploadBytes(r, gpxBytes, { contentType: "application/gpx+xml" });
    await setDoc(docRef, { trackStoragePath: path }, { merge: true });
  } catch {
    // GPX upload is non-critical — session is already visible on the website.
  }
}

/**
 * Delete a session from local storage and Firestore. Best-effort: removes
 * the Firestore doc, public copy, and Storage files; never throws on partial
 * failure so the local copy is always cleaned up first.
 */
export async function deleteSession(session: Session): Promise<void> {
  await removeLocal(session.id);

  const user = auth.currentUser;
  if (!user) return;

  // Remove private Firestore doc
  await deleteDoc(doc(db, "users", user.uid, "sessions", session.id)).catch(() => undefined);

  // Remove public copy if it exists
  if (session.isPublic) {
    await deleteDoc(doc(db, "publicSessions", session.id)).catch(() => undefined);
  }

  // Remove Storage files (best-effort)
  if (session.trackStoragePath) {
    await deleteObject(ref(storage, session.trackStoragePath)).catch(() => undefined);
  }
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
  // An owner-less session on this phone is the signed-in user's (see
  // isUnownedSession). Only one stamped with a different account is refused.
  if (!canActOnSession(session, user.uid)) throw new Error("not your session");
  const owned = await stampLocalOwner(session, user.uid);

  // Update the private source-of-truth doc. userId is always the real uid:
  // writing the local "" back would also be refused by the rules, which
  // forbid changing a session's userId.
  const privateRef = doc(db, "users", user.uid, "sessions", session.id);
  await setDoc(privateRef, { ...owned, userId: user.uid, isPublic }, { merge: true });

  // Write or remove the public copy
  const publicRef = doc(db, "publicSessions", session.id);
  if (isPublic) {
    await setDoc(publicRef, { ...owned, userId: user.uid, isPublic: true });
  } else {
    await deleteDoc(publicRef).catch(() => undefined);
  }
}
