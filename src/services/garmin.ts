/**
 * Garmin watch support — pairing and session pull.
 *
 * Unlike the Apple Watch and Wear OS apps, the Connect IQ app has no native
 * bridge to the phone: it uploads finished sessions straight to the
 * `garminIngest` Cloud Function over HTTPS (tunnelled through Garmin Connect
 * Mobile). Sessions therefore land in Firestore first and have to be pulled
 * down into the local store, which is what every screen in the app reads.
 *
 * Pairing is a 6-digit code minted here and typed into the ImuaTrak app's
 * settings inside Garmin Connect Mobile. The watch trades it for a long-lived
 * upload token on its first upload.
 */

import { collection, getDocs, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref } from "firebase/storage";

import type { Session, TrackPoint } from "@/models";

import { auth, db, functions, storage } from "./firebase";
import * as storageSvc from "./storage";

export interface LinkedDevice {
  /** Link document id — pass back to `unlinkDevice`. */
  id: string;
  /** Device name the watch reported, e.g. "fenix7". */
  deviceName: string;
  linkedAt: string;
  lastSeenAt?: string;
}

export interface PairingCode {
  code: string;
  /** ISO-8601. Codes are short-lived so an overheard one is near-useless. */
  expiresAt: string;
}

/** Mint a short-lived pairing code to type into Garmin Connect Mobile. */
export async function createPairingCode(): Promise<PairingCode> {
  const fn = httpsCallable<void, PairingCode>(functions, "createGarminPairingCode");
  const res = await fn();
  return res.data;
}

/** Watches currently allowed to upload for the signed-in user. */
export async function listLinkedDevices(): Promise<LinkedDevice[]> {
  const fn = httpsCallable<void, { devices: LinkedDevice[] }>(functions, "listGarminDevices");
  const res = await fn();
  return res.data.devices;
}

/** Revoke one watch's upload token. */
export async function unlinkDevice(id: string): Promise<void> {
  const fn = httpsCallable<{ id: string }, { success: boolean }>(functions, "unlinkGarminDevice");
  await fn({ id });
}

/**
 * Copy any Garmin sessions that only exist in Firestore into the local store.
 *
 * Returns the number of sessions newly brought down. Best-effort per session:
 * one failed track download doesn't abort the rest. Safe to call often — it
 * skips ids already on disk.
 */
export async function pullGarminSessions(): Promise<number> {
  const user = auth.currentUser;
  if (!user) return 0;

  const snap = await getDocs(
    query(collection(db, "users", user.uid, "sessions"), where("source", "==", "garmin")),
  );
  if (snap.empty) return 0;

  const local = new Set((await storageSvc.listSummaries()).map((s) => s.session.id));

  let pulled = 0;
  for (const docSnap of snap.docs) {
    if (local.has(docSnap.id)) continue;
    const session = docSnap.data() as Session;
    try {
      const track = await fetchTrack(session);
      await storageSvc.save(session, track);
      await storageSvc.markSynced(session.id);
      pulled++;
    } catch {
      // Leave it in Firestore; the next pull retries.
    }
  }
  return pulled;
}

/**
 * The full-resolution track lives in Storage (too big for a Firestore doc).
 * Fall back to the 200-point `trackSummary` embedded in the document so a
 * session is still viewable if the Storage object is missing.
 */
async function fetchTrack(session: Session): Promise<TrackPoint[]> {
  const path = session.garminTrackPath;
  if (path) {
    try {
      const url = await getDownloadURL(ref(storage, path));
      const res = await fetch(url);
      if (res.ok) {
        const points = (await res.json()) as TrackPoint[];
        if (Array.isArray(points) && points.length > 0) return points;
      }
    } catch {
      // fall through to the summary
    }
  }
  return session.trackSummary.map((p) => ({ ...p }));
}
