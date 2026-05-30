import * as crypto from "crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

initializeApp();

// ---------------------------------------------------------------------------
// renderSessionCard — produces a PNG share card (map snapshot + stats overlay)
// for a finished session and stores it at users/{uid}/cards/{sessionId}.png.
// Stub implementation; concrete rendering uses @napi-rs/canvas + a static
// map tile provider, wired up in Phase 4.
// ---------------------------------------------------------------------------
export const renderSessionCard = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign-in required");

  const { sessionId } = request.data ?? {};
  if (typeof sessionId !== "string" || !sessionId) {
    throw new HttpsError("invalid-argument", "sessionId is required");
  }

  const snap = await getFirestore()
    .doc(`users/${uid}/sessions/${sessionId}`)
    .get();
  if (!snap.exists) throw new HttpsError("not-found", "Session not found");

  // TODO(phase-4): render PNG, upload to Storage, return signed URL.
  const path = `users/${uid}/cards/${sessionId}.png`;
  await getStorage().bucket().file(path).save(Buffer.from([]), {
    contentType: "image/png",
  });

  return { path, status: "stub" };
});

// ---------------------------------------------------------------------------
// fetchWeather — server-side proxy to OpenWeather so the API key never ships
// in the Android app. iOS uses WeatherKit directly.
// ---------------------------------------------------------------------------
export const fetchWeather = onCall(async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign-in required");
    }

    const { lat, lon } = request.data ?? {};
    if (typeof lat !== "number" || typeof lon !== "number") {
      throw new HttpsError("invalid-argument", "lat and lon are required");
    }

    const url =
      `https://api.openweathermap.org/data/2.5/weather` +
      `?lat=${lat}&lon=${lon}&units=metric` +
      `&appid=${process.env.OPENWEATHER_API_KEY ?? ""}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new HttpsError("internal", `Weather upstream: ${res.status}`);
    }
    const j = (await res.json()) as {
      wind?: { speed?: number; deg?: number; gust?: number };
      main?: { temp?: number; pressure?: number };
      weather?: Array<{ main?: string }>;
    };
    return {
      windMps: j.wind?.speed ?? 0,
      windDeg: j.wind?.deg ?? 0,
      gustMps: j.wind?.gust ?? 0,
      airTempC: j.main?.temp ?? 0,
      pressureHpa: j.main?.pressure ?? 0,
      conditions: j.weather?.[0]?.main ?? "Unknown",
    };
  },
);

// ---------------------------------------------------------------------------
// onMemberJoin — increments memberCount on the parent club document whenever
// a new member document is created in clubs/{clubId}/members/{uid}.
// This is the authoritative server-side counter; the client also increments
// optimistically on join, so using FieldValue.increment keeps it idempotent.
// ---------------------------------------------------------------------------
export const onMemberJoin = onDocumentCreated(
  "clubs/{clubId}/members/{uid}",
  async (event) => {
    const { clubId } = event.params;
    await getFirestore()
      .doc(`clubs/${clubId}`)
      .update({ memberCount: FieldValue.increment(1) });
  },
);

// ---------------------------------------------------------------------------
// linkSessionsToEvent — when a session is created, checks if it overlaps in
// time with any events in clubs the user belongs to, and appends the sessionId
// to those events' linkedSessionIds arrays.
//
// Session doc shape: { startedAt: string (ISO-8601), endedAt: string (ISO-8601) }
// Overlap condition: event.startAt <= session.endedAt AND
//                   event.endAt   >= session.startedAt
// ---------------------------------------------------------------------------
export const linkSessionsToEvent = onDocumentCreated(
  "users/{uid}/sessions/{sessionId}",
  async (event) => {
    const { uid, sessionId } = event.params;
    const sessionData = event.data?.data() as
      | { startedAt: string; endedAt: string }
      | undefined;

    if (!sessionData?.startedAt || !sessionData?.endedAt) return;

    const { startedAt, endedAt } = sessionData;
    const db = getFirestore();

    // Read the user→club index
    const userClubsSnap = await db.doc(`userClubs/${uid}`).get();
    if (!userClubsSnap.exists) return;

    const clubIds: string[] =
      (userClubsSnap.data() as { clubIds?: string[] } | undefined)?.clubIds ?? [];
    if (clubIds.length === 0) return;

    const updates: Promise<FirebaseFirestore.WriteResult>[] = [];

    for (const clubId of clubIds) {
      // Query events that overlap the session's time window.
      // Overlap: event.startAt <= session.endedAt AND event.endAt >= session.startedAt
      const eventsSnap = await db
        .collection(`clubs/${clubId}/events`)
        .where("startAt", "<=", endedAt)
        .where("endAt", ">=", startedAt)
        .limit(5)
        .get();

      for (const eventDoc of eventsSnap.docs) {
        updates.push(
          eventDoc.ref.update({
            linkedSessionIds: FieldValue.arrayUnion(sessionId),
          }),
        );
      }
    }

    await Promise.all(updates);
  },
);

// ---------------------------------------------------------------------------
// createClubInvite — callable function that generates a secure invite token
// for a club. Only owners and admins may create invites.
// Client-side invite creation is replaced by this function so the token is
// always written via the admin SDK (bypassing Firestore rules).
//
// Request:  { clubId: string }
// Response: { token: string }
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// mobileAppleSignIn — verifies a native iOS Apple ID token (audience = bundle
// ID) and returns a Firebase custom token. This sidesteps the audience mismatch
// that occurs when a web Services ID is also configured in Firebase Console:
// Firebase's signInWithCredential would reject native tokens because it now
// expects Services-ID audience, not bundle-ID audience.
// ---------------------------------------------------------------------------
export const mobileAppleSignIn = onCall(async (request) => {
  const { idToken } = (request.data ?? {}) as { idToken?: unknown };
  if (typeof idToken !== "string" || !idToken) {
    throw new HttpsError("invalid-argument", "idToken is required");
  }

  const parts = idToken.split(".");
  if (parts.length !== 3) throw new HttpsError("invalid-argument", "Malformed JWT");
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  let header: { kid: string; alg: string };
  let payload: { iss: string; aud: string | string[]; exp: number; sub: string; email?: string };
  try {
    header = JSON.parse(Buffer.from(headerB64, "base64url").toString());
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
  } catch {
    throw new HttpsError("invalid-argument", "Failed to decode Apple token");
  }

  // Validate claims
  if (payload.iss !== "https://appleid.apple.com") {
    throw new HttpsError("invalid-argument", "Invalid Apple token issuer");
  }
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes("app.imuatrak")) {
    throw new HttpsError("invalid-argument", "Token audience does not match app bundle ID");
  }
  if (payload.exp < Date.now() / 1000) {
    throw new HttpsError("invalid-argument", "Apple token has expired");
  }

  // Verify signature against Apple's public keys
  try {
    const jwksRes = await fetch("https://appleid.apple.com/auth/keys");
    const jwks = (await jwksRes.json()) as {
      keys: Array<{ kid: string; kty: string; n: string; e: string; alg: string }>;
    };
    const keyData = jwks.keys.find((k) => k.kid === header.kid);
    if (!keyData) throw new Error("Apple public key not found");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pubKey = crypto.createPublicKey({ key: keyData as any, format: "jwk" });
    const signedData = Buffer.from(`${headerB64}.${payloadB64}`);
    const signature = Buffer.from(sigB64, "base64url");
    const valid = crypto.verify(
      "sha256",
      signedData,
      { key: pubKey, padding: crypto.constants.RSA_PKCS1_PADDING },
      signature,
    );
    if (!valid) throw new Error("Signature invalid");
  } catch (e) {
    throw new HttpsError("invalid-argument", `Apple token verification failed: ${e instanceof Error ? e.message : e}`);
  }

  const appleSub = payload.sub;
  const auth = getAuth();

  // Reuse the existing Firebase UID if this Apple account has signed in before.
  let uid: string;
  try {
    const existing = await auth.getUserByProviderUid("apple.com", appleSub);
    uid = existing.uid;
  } catch {
    // New user — derive a stable UID from the Apple subject so repeated
    // sign-ins without a pre-existing Firebase account still converge.
    uid = `apple_${appleSub.replace(/[^a-zA-Z0-9]/g, "_")}`;
  }

  const customToken = await auth.createCustomToken(uid, {
    provider: "apple.com",
    email: payload.email ?? null,
  });
  return { customToken };
});

export const createClubInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign-in required");

  const { clubId } = (request.data ?? {}) as { clubId?: unknown };
  if (typeof clubId !== "string" || !clubId) {
    throw new HttpsError("invalid-argument", "clubId is required");
  }

  const db = getFirestore();

  // Verify caller is an owner or admin of the club
  const memberSnap = await db.doc(`clubs/${clubId}/members/${uid}`).get();
  if (!memberSnap.exists) {
    throw new HttpsError("permission-denied", "You are not a member of this club");
  }
  const memberRole = (memberSnap.data() as { role?: string } | undefined)?.role;
  if (memberRole !== "owner" && memberRole !== "admin") {
    throw new HttpsError("permission-denied", "Only owners and admins can create invite links");
  }

  const token = crypto.randomBytes(6).toString("hex"); // 12 hex chars
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  await db.doc(`clubInvites/${token}`).set({
    clubId,
    createdBy: uid,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });

  return { token };
});
