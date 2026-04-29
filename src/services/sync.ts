import * as FileSystem from "expo-file-system";
import { doc, setDoc } from "firebase/firestore";
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
