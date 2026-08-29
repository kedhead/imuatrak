/**
 * Garmin Connect IQ watch support.
 *
 * The watch app (see `garmin/` at the repo root) has no native bridge to the
 * phone the way the Apple Watch and Wear OS apps do — it uploads finished
 * sessions straight here over HTTPS, tunnelled through Garmin Connect Mobile.
 *
 * Because the watch cannot hold a Firebase credential, uploads are authorised
 * by a bearer token minted from a short-lived 6-digit pairing code the user
 * generates in the phone app and types into the ImuaTrak app's settings inside
 * Garmin Connect Mobile:
 *
 *   phone   createGarminPairingCode()  → garminPairing/{code}  (15 min, single use)
 *   watch   POST { pairingCode, … }    → token minted, garminLinks/{sha256(token)}
 *   watch   POST { token, … }          → session written for that uid
 *
 * Only the token's SHA-256 is stored, so a database leak doesn't yield working
 * upload credentials.
 *
 * NOTE: no defineSecret() in this module, deliberately. An unresolvable secret
 * anywhere in the codebase fails the deploy of every function (see the header
 * of revenuecat.ts).
 */

import * as crypto from "crypto";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";

const SCHEMA_VERSION = 1;
const PAIRING_TTL_MS = 15 * 60 * 1000;
/** Points kept in the Firestore document; the full track goes to Storage. */
const SUMMARY_POINTS = 200;
/** Hard ceilings — a watch has no business exceeding these. */
const MAX_TRACK_POINTS = 500;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_SPLITS = 200;
const MAX_SIDE_SWITCHES = 2000;
const MAX_WEATHER_SAMPLES = 50;
/** Per-token upload ceiling, in a rolling window. */
const RATE_LIMIT_UPLOADS = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const CRAFT_TYPES = ["OC1", "OC2", "OC6", "V1", "SUP", "SURFSKI", "DB10", "DB20", "OTHER"];

// ── Pairing (phone side) ─────────────────────────────────────────────────────

export const createGarminPairingCode = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first");

  const db = getFirestore();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();

  // Codes are short and live in a shared namespace, so claim one atomically
  // rather than trusting a read-then-write.
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    try {
      await db.collection("garminPairing").doc(code).create({
        uid,
        createdAt: new Date().toISOString(),
        expiresAt,
      });
      return { code, expiresAt };
    } catch {
      // Code already taken (an unexpired one) — try another.
    }
  }
  throw new HttpsError("resource-exhausted", "Could not allocate a pairing code, try again");
});

export const listGarminDevices = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first");

  const snap = await getFirestore().collection("garminLinks").where("uid", "==", uid).get();
  const devices = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      deviceName: (data.deviceName as string | undefined) ?? "Garmin watch",
      linkedAt: (data.linkedAt as string | undefined) ?? "",
      lastSeenAt: data.lastSeenAt as string | undefined,
    };
  });
  return { devices };
});

export const unlinkGarminDevice = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first");
  const id = String((request.data as { id?: unknown } | undefined)?.id ?? "");
  if (!/^[a-f0-9]{64}$/.test(id)) throw new HttpsError("invalid-argument", "Bad device id");

  const db = getFirestore();
  const ref = db.collection("garminLinks").doc(id);
  const doc = await ref.get();
  // Not found and not-yours are the same answer, so this can't be used to
  // probe for other users' link ids.
  if (!doc.exists || doc.data()?.uid !== uid) {
    throw new HttpsError("not-found", "Device not found");
  }
  await ref.delete();
  return { success: true };
});

// ── Ingest (watch side) ──────────────────────────────────────────────────────

export const garminIngest = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  if ((req.rawBody?.length ?? 0) > MAX_BODY_BYTES) {
    res.status(413).json({ error: "Payload too large" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const db = getFirestore();

  let uid: string;
  let linkId: string;
  let mintedToken: string | undefined;

  try {
    if (typeof body.token === "string" && body.token.length > 0) {
      linkId = sha256(body.token);
      const link = await db.collection("garminLinks").doc(linkId).get();
      if (!link.exists) {
        res.status(401).json({ error: "Unknown token, re-pair the watch" });
        return;
      }
      uid = link.data()!.uid as string;
      if (isRateLimited(link.data()!)) {
        res.status(429).json({ error: "Too many uploads, try later" });
        return;
      }
    } else if (typeof body.pairingCode === "string") {
      const redeemed = await redeemPairingCode(body.pairingCode, str(body.deviceName, 64));
      if (!redeemed) {
        res.status(401).json({ error: "Pairing code invalid or expired" });
        return;
      }
      ({ uid, linkId } = redeemed);
      mintedToken = redeemed.token;
    } else {
      res.status(401).json({ error: "Missing token or pairingCode" });
      return;
    }
  } catch (e) {
    console.error("garminIngest auth failed", e);
    res.status(500).json({ error: "Internal error" });
    return;
  }

  let session: Record<string, unknown>;
  let track: TrackPoint[];
  try {
    const parsed = parseUpload(body);
    session = parsed.session;
    track = parsed.track;
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Bad payload" });
    return;
  }

  const id = session.id as string;
  const sessionRef = db.collection("users").doc(uid).collection("sessions").doc(id);

  try {
    // Idempotent: the watch re-sends anything it never saw a response for, so a
    // dropped reply must not create a second copy or a second charge.
    if ((await sessionRef.get()).exists) {
      await touchLink(linkId, false);
      res.status(200).json({ status: "duplicate", token: mintedToken });
      return;
    }

    let garminTrackPath: string | undefined;
    if (track.length > 0) {
      garminTrackPath = `users/${uid}/garminTracks/${id}.json`;
      // The download token isn't used to hand the URL out — the phone still
      // resolves the object through getDownloadURL() under the owner-only
      // Storage rule. It's set because an object written by the Admin SDK has
      // no token of its own, which is what getDownloadURL() reads.
      await getStorage()
        .bucket()
        .file(garminTrackPath)
        .save(JSON.stringify(track), {
          contentType: "application/json",
          metadata: { metadata: { firebaseStorageDownloadTokens: crypto.randomUUID() } },
        });
    }

    await sessionRef.set({
      ...session,
      userId: uid,
      source: "garmin",
      trackSummary: downsample(track, SUMMARY_POINTS),
      ...(garminTrackPath ? { garminTrackPath } : {}),
      isPublic: false,
    });

    await touchLink(linkId, true);
    res.status(200).json({ status: "ok", id, token: mintedToken });
  } catch (e) {
    console.error("garminIngest write failed", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function isRateLimited(link: FirebaseFirestore.DocumentData): boolean {
  const windowStart = Date.parse((link.rateWindowStartAt as string | undefined) ?? "");
  if (!Number.isFinite(windowStart) || Date.now() - windowStart > RATE_LIMIT_WINDOW_MS) return false;
  return ((link.rateWindowCount as number | undefined) ?? 0) >= RATE_LIMIT_UPLOADS;
}

/** Record the upload against the token's rolling rate-limit window. */
async function touchLink(linkId: string, counts: boolean): Promise<void> {
  const ref = getFirestore().collection("garminLinks").doc(linkId);
  const now = new Date();
  if (!counts) {
    await ref.update({ lastSeenAt: now.toISOString() }).catch(() => undefined);
    return;
  }
  await getFirestore()
    .runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) return;
      const started = Date.parse((doc.data()!.rateWindowStartAt as string | undefined) ?? "");
      const fresh = !Number.isFinite(started) || now.getTime() - started > RATE_LIMIT_WINDOW_MS;
      tx.update(ref, {
        lastSeenAt: now.toISOString(),
        rateWindowStartAt: fresh ? now.toISOString() : new Date(started).toISOString(),
        rateWindowCount: fresh ? 1 : FieldValue.increment(1),
      });
    })
    .catch(() => undefined);
}

/**
 * Trade a pairing code for a long-lived upload token. The code is consumed in
 * the same transaction that reads it, so two watches racing on one code can't
 * both link.
 */
async function redeemPairingCode(
  code: string,
  deviceName: string | undefined,
): Promise<{ uid: string; linkId: string; token: string } | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const db = getFirestore();
  const ref = db.collection("garminPairing").doc(code);

  const uid = await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return null;
    const data = doc.data()!;
    tx.delete(ref);
    const expiresAt = Date.parse((data.expiresAt as string | undefined) ?? "");
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
    return data.uid as string;
  });
  if (!uid) return null;

  const token = crypto.randomBytes(32).toString("base64url");
  const linkId = sha256(token);
  await db.collection("garminLinks").doc(linkId).set({
    uid,
    deviceName: deviceName ?? "Garmin watch",
    linkedAt: new Date().toISOString(),
  });
  return { uid, linkId, token };
}

interface TrackPoint {
  t: number;
  lat: number;
  lon: number;
  altM: number;
  speedMps: number;
  hr?: number;
  strokeRate?: number;
  cadenceConfidence?: number;
}

/**
 * Build the session document from the upload field by field. Nothing from the
 * request is spread into Firestore unchecked — the watch is an unauthenticated
 * client, so an upload must not be able to set `isPublic`, overwrite `userId`,
 * or smuggle in arbitrary keys.
 */
function parseUpload(body: Record<string, unknown>): {
  session: Record<string, unknown>;
  track: TrackPoint[];
} {
  const raw = body.session;
  if (!raw || typeof raw !== "object") throw new Error("Missing session");
  const s = raw as Record<string, unknown>;

  const id = str(s.id, 64);
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("Bad session id");
  if (num(s.schemaVersion, 0) !== SCHEMA_VERSION) throw new Error("Unsupported schemaVersion");

  const craftType = str(s.craftType, 16);
  if (!craftType || !CRAFT_TYPES.includes(craftType)) throw new Error("Bad craftType");

  const startedAt = isoDate(s.startedAt);
  const endedAt = isoDate(s.endedAt);
  if (!startedAt || !endedAt) throw new Error("Bad startedAt/endedAt");

  const rawTrack = Array.isArray(body.track) ? body.track : [];
  if (rawTrack.length > MAX_TRACK_POINTS) throw new Error("Track too long");
  const track = rawTrack.map(trackPoint).filter((p): p is TrackPoint => p !== null);

  return {
    session: {
      id,
      schemaVersion: SCHEMA_VERSION,
      appVersion: str(s.appVersion, 32) ?? "0.0.0",
      craftType,
      startedAt,
      endedAt,
      totals: totals(s.totals),
      hr: hrSummary(s.hr),
      splits: array(s.splits, MAX_SPLITS).map(split),
      sideSwitches: array(s.sideSwitches, MAX_SIDE_SWITCHES).map(sideSwitch),
      ...(weather(s.weather) ? { weather: weather(s.weather) } : {}),
    },
    track,
  };
}

function totals(raw: unknown): Record<string, number> {
  const t = obj(raw);
  return {
    distanceMeters: num(t.distanceMeters, 0),
    durationSec: num(t.durationSec, 0),
    movingDurationSec: num(t.movingDurationSec, 0),
    avgPaceSecPerKm: num(t.avgPaceSecPerKm, 0),
    avgSpeedMps: num(t.avgSpeedMps, 0),
    maxSpeedMps: num(t.maxSpeedMps, 0),
    strokeCount: Math.round(num(t.strokeCount, 0)),
    avgStrokeRate: num(t.avgStrokeRate, 0),
    calories: num(t.calories, 0),
    elevationGainM: num(t.elevationGainM, 0),
  };
}

function hrSummary(raw: unknown): Record<string, unknown> {
  const h = obj(raw);
  return {
    avg: Math.round(num(h.avg, 0)),
    max: Math.round(num(h.max, 0)),
    zones: array(h.zones, 16).map((z) => {
      const zone = obj(z);
      return {
        zone: Math.round(num(zone.zone, 0)),
        minBpm: Math.round(num(zone.minBpm, 0)),
        maxBpm: Math.round(num(zone.maxBpm, 0)),
        timeSec: num(zone.timeSec, 0),
      };
    }),
  };
}

function split(raw: unknown): Record<string, number> {
  const s = obj(raw);
  return {
    index: Math.round(num(s.index, 0)),
    distanceM: num(s.distanceM, 0),
    durationSec: num(s.durationSec, 0),
    avgHr: num(s.avgHr, 0),
    avgStrokeRate: num(s.avgStrokeRate, 0),
    avgSpeedMps: num(s.avgSpeedMps, 0),
  };
}

function sideSwitch(raw: unknown): Record<string, unknown> {
  const s = obj(raw);
  return {
    tSec: num(s.tSec, 0),
    detectedSide: str(s.detectedSide, 1) === "R" ? "R" : "L",
    confidence: num(s.confidence, 0),
    source: str(s.source, 8) === "manual" ? "manual" : "audio",
  };
}

function weather(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const w = obj(raw);
  const sample = (r: unknown): Record<string, unknown> => {
    const s = obj(r);
    return {
      tSec: num(s.tSec, 0),
      windMps: num(s.windMps, 0),
      windDeg: num(s.windDeg, 0),
      gustMps: num(s.gustMps, 0),
      airTempC: num(s.airTempC, 0),
      pressureHpa: num(s.pressureHpa, 0),
      ...(str(s.conditions, 64) ? { conditions: str(s.conditions, 64) } : {}),
    };
  };
  if (!w.start) return null;
  return {
    start: sample(w.start),
    samples: array(w.samples, MAX_WEATHER_SAMPLES).map(sample),
  };
}

function trackPoint(raw: unknown): TrackPoint | null {
  const p = obj(raw);
  const lat = num(p.lat, NaN);
  const lon = num(p.lon, NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const point: TrackPoint = {
    t: num(p.t, 0),
    lat,
    lon,
    altM: num(p.altM, 0),
    speedMps: num(p.speedMps, 0),
  };
  if (Number.isFinite(num(p.hr, NaN))) point.hr = Math.round(num(p.hr, 0));
  if (Number.isFinite(num(p.strokeRate, NaN))) point.strokeRate = num(p.strokeRate, 0);
  if (Number.isFinite(num(p.cadenceConfidence, NaN))) {
    point.cadenceConfidence = num(p.cadenceConfidence, 0);
  }
  return point;
}

/** Evenly-spaced subset, matching Aggregator.downsample on the watch. */
function downsample(track: TrackPoint[], maxPoints: number): TrackPoint[] {
  if (track.length <= maxPoints) return track;
  const step = track.length / maxPoints;
  return Array.from({ length: maxPoints }, (_, i) => track[Math.floor(i * step)]!);
}

function obj(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function array(raw: unknown, max: number): unknown[] {
  return Array.isArray(raw) ? raw.slice(0, max) : [];
}

function num(raw: unknown, fallback: number): number {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
}

function str(raw: unknown, maxLength: number): string | undefined {
  return typeof raw === "string" && raw.length > 0 ? raw.slice(0, maxLength) : undefined;
}

function isoDate(raw: unknown): string | undefined {
  const value = str(raw, 40);
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}
