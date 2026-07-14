import * as crypto from "crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentDeleted } from "firebase-functions/v2/firestore";

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
// uploadChannelMedia — receives a base64 image/video from a club member and
// writes it to Storage with the Admin SDK. This sidesteps the React Native
// Storage-upload minefield entirely: the JS SDK can't build its multipart body
// (RN can't make a Blob from an ArrayBuffer), and the raw REST endpoint kept
// hitting auth/rules/bucket 403s. Admin writes bypass Storage rules and target
// the real default bucket, so uploads just work. Membership is enforced here.
// ---------------------------------------------------------------------------
export const uploadChannelMedia = onCall({ memory: "512MiB" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign-in required");

  const { clubId, channelId, messageId, base64, contentType } = request.data ?? {};
  if (
    typeof clubId !== "string" ||
    typeof channelId !== "string" ||
    typeof messageId !== "string" ||
    typeof base64 !== "string" ||
    typeof contentType !== "string"
  ) {
    throw new HttpsError("invalid-argument", "Missing upload fields");
  }
  if (!/^(image|video)\//.test(contentType)) {
    throw new HttpsError("invalid-argument", "Only image or video uploads are allowed");
  }

  // Must be a member of the club to post media.
  const memberSnap = await getFirestore().doc(`clubs/${clubId}/members/${uid}`).get();
  if (!memberSnap.exists) throw new HttpsError("permission-denied", "Not a club member");

  const buffer = Buffer.from(base64, "base64");
  // Callable request payloads are capped (~10 MB); base64 inflates ~33%, so
  // hold the decoded file to 7 MB. Covers phone photos; large videos need the
  // signed-URL path (follow-up).
  if (buffer.length > 7 * 1024 * 1024) {
    throw new HttpsError("invalid-argument", "File too large (max ~7 MB for now)");
  }

  const ext = contentType.split("/")[1] || "bin";
  const path = `clubs/${clubId}/channels/${channelId}/messages/${messageId}/media.${ext}`;
  const token = crypto.randomUUID();
  const bucket = getStorage().bucket();

  await bucket.file(path).save(buffer, {
    contentType,
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });

  const mediaUrl =
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
    `${encodeURIComponent(path)}?alt=media&token=${token}`;

  await getFirestore()
    .doc(`clubs/${clubId}/channels/${channelId}/messages/${messageId}`)
    .update({ mediaUrl, mediaStoragePath: `gs://${bucket.name}/${path}` });

  return { mediaUrl };
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
// onMemberJoin / onMemberLeave — maintain memberCount on the parent club
// document from member-doc lifecycle events. These triggers are the ONLY
// writers of memberCount (clients have no rules carve-out for it), so the
// counter can't be spoofed or double-counted.
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

export const onMemberLeave = onDocumentDeleted(
  "clubs/{clubId}/members/{uid}",
  async (event) => {
    const { clubId } = event.params;
    // The club doc may already be gone when a club is deleted outright.
    await getFirestore()
      .doc(`clubs/${clubId}`)
      .update({ memberCount: FieldValue.increment(-1) })
      .catch(() => undefined);
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
      // Firestore permits a range/inequality filter on only ONE field per
      // query, so we cannot filter both startAt and endAt server-side.
      // Constrain on startAt (<= session end), order/limit by the same field,
      // then apply the second overlap bound (endAt >= session start) in memory.
      const eventsSnap = await db
        .collection(`clubs/${clubId}/events`)
        .where("startAt", "<=", endedAt)
        .orderBy("startAt", "desc")
        .limit(20)
        .get();

      for (const eventDoc of eventsSnap.docs) {
        const evEndAt = (eventDoc.data() as { endAt?: string }).endAt;
        if (typeof evEndAt !== "string" || evEndAt < startedAt) continue;
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
  const { idToken, rawNonce } = (request.data ?? {}) as {
    idToken?: unknown;
    rawNonce?: unknown;
  };
  if (typeof idToken !== "string" || !idToken) {
    throw new HttpsError("invalid-argument", "idToken is required");
  }
  if (typeof rawNonce !== "string" || !rawNonce) {
    throw new HttpsError("invalid-argument", "rawNonce is required");
  }

  const parts = idToken.split(".");
  if (parts.length !== 3) throw new HttpsError("invalid-argument", "Malformed JWT");
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  let header: { kid: string; alg: string };
  let payload: {
    iss: string;
    aud: string | string[];
    exp: number;
    sub: string;
    email?: string;
    nonce?: string;
  };
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
  // Anti-replay: the client hashed rawNonce (SHA-256, lowercase hex) and sent
  // it to Apple, which echoes it back in the token's nonce claim. Requiring
  // the caller to present the matching raw nonce ties this call to the
  // sign-in ceremony that produced the token.
  const expectedNonce = crypto.createHash("sha256").update(rawNonce).digest("hex");
  if (payload.nonce !== expectedNonce) {
    throw new HttpsError("invalid-argument", "Apple token nonce mismatch");
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
  const adminAuth = getAuth();

  // Reuse the existing Firebase UID if this Apple account has signed in before.
  let uid: string;
  try {
    const existing = await adminAuth.getUserByProviderUid("apple.com", appleSub);
    uid = existing.uid;
    console.log("mobileAppleSignIn: found existing user", uid);
  } catch {
    uid = `apple_${appleSub.replace(/[^a-zA-Z0-9]/g, "_")}`;
    console.log("mobileAppleSignIn: new user, derived uid", uid);
  }

  try {
    const customToken = await adminAuth.createCustomToken(uid);
    return { customToken };
  } catch (e) {
    console.error("mobileAppleSignIn: createCustomToken failed", e);
    throw new HttpsError("internal", `Failed to create token: ${e instanceof Error ? e.message : e}`);
  }
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

// ---------------------------------------------------------------------------
// createChannel — subscription-gated callable that creates a new chat channel.
// Free/expired clubs may only have the General channel; trial/active clubs are
// unlimited. All channel creation goes through this function so billing logic
// stays server-side and security rules can simply deny direct client writes.
//
// Request:  { clubId, name, icon, iconType, description?, isPrivate, memberIds? }
// Response: ClubChannel
// ---------------------------------------------------------------------------
export const createChannel = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign-in required");

  const {
    clubId,
    name,
    icon,
    iconType,
    description,
    isPrivate,
    memberIds,
  } = (request.data ?? {}) as {
    clubId?: unknown;
    name?: unknown;
    icon?: unknown;
    iconType?: unknown;
    description?: unknown;
    isPrivate?: unknown;
    memberIds?: unknown;
  };

  if (typeof clubId !== "string" || !clubId) {
    throw new HttpsError("invalid-argument", "clubId is required");
  }
  if (typeof name !== "string" || !name.trim()) {
    throw new HttpsError("invalid-argument", "name is required");
  }
  if (typeof icon !== "string" || !icon) {
    throw new HttpsError("invalid-argument", "icon is required");
  }
  if (iconType !== "emoji" && iconType !== "ionicon") {
    throw new HttpsError("invalid-argument", "iconType must be emoji or ionicon");
  }

  const db = getFirestore();

  const memberSnap = await db.doc(`clubs/${clubId}/members/${uid}`).get();
  if (!memberSnap.exists) {
    throw new HttpsError("permission-denied", "You are not a member of this club");
  }
  const memberRole = (memberSnap.data() as { role?: string } | undefined)?.role;
  if (memberRole !== "owner" && memberRole !== "admin") {
    throw new HttpsError("permission-denied", "Only owners and admins can create channels");
  }

  const clubSnap = await db.doc(`clubs/${clubId}`).get();
  const clubData = clubSnap.data() as { subscriptionStatus?: string } | undefined;
  if (clubData?.subscriptionStatus === "expired") {
    const existingChannels = await db.collection(`clubs/${clubId}/channels`).count().get();
    if (existingChannels.data().count >= 1) {
      throw new HttpsError(
        "permission-denied",
        "Upgrade your subscription to add more channels",
      );
    }
  }

  const existingChannels = await db.collection(`clubs/${clubId}/channels`).get();
  const sortOrder = existingChannels.size;

  const now = new Date().toISOString();
  const channelRef = db.collection(`clubs/${clubId}/channels`).doc();
  const channelData = {
    id: channelRef.id,
    clubId,
    name: (name as string).trim(),
    icon: icon as string,
    iconType: iconType as "emoji" | "ionicon",
    description: typeof description === "string" ? description.trim() : "",
    isPrivate: Boolean(isPrivate),
    memberIds: Array.isArray(memberIds)
      ? (memberIds as unknown[]).filter((v): v is string => typeof v === "string")
      : [],
    createdBy: uid,
    createdAt: now,
    sortOrder,
  };
  await channelRef.set(channelData);

  return channelData;
});

// ---------------------------------------------------------------------------
// onChannelMessageCreate — sends FCM push notifications to channel members
// when a new message is created, respecting per-user mute preferences.
// Also updates lastMessageAt on the channel doc for unread indicators.
// ---------------------------------------------------------------------------
export const onChannelMessageCreate = onDocumentCreated(
  "clubs/{clubId}/channels/{channelId}/messages/{messageId}",
  async (event) => {
    const { clubId, channelId } = event.params;
    const messageData = event.data?.data() as {
      authorId: string;
      authorName: string;
      content: string;
    } | undefined;
    if (!messageData) return;

    const db = getFirestore();

    const channelSnap = await db.doc(`clubs/${clubId}/channels/${channelId}`).get();
    if (!channelSnap.exists) return;
    const channel = channelSnap.data() as {
      name: string;
      isPrivate: boolean;
      memberIds: string[];
    };

    let recipientUids: string[];
    if (channel.isPrivate) {
      recipientUids = channel.memberIds;
    } else {
      const membersSnap = await db.collection(`clubs/${clubId}/members`).get();
      recipientUids = membersSnap.docs.map((d) => d.id);
    }

    recipientUids = recipientUids.filter((id) => id !== messageData.authorId);
    if (recipientUids.length === 0) return;

    const body = messageData.content.length > 0
      ? messageData.content.slice(0, 200)
      : "Sent a photo";

    // Per recipient: atomically bump this channel's unread count and the
    // user's global unread total (drives the app-icon badge), then push with
    // that real total as the badge. Muted recipients are still counted (they
    // have unread) but get no alert — their badge syncs on next app open.
    await Promise.all(
      recipientUids.map(async (userId) => {
        const userRef = db.doc(`users/${userId}`);
        const prefRef = db.doc(`users/${userId}/channelPreferences/${channelId}`);

        const { newTotal, muted } = await db.runTransaction(async (tx) => {
          const [userSnap, prefSnap] = await Promise.all([tx.get(userRef), tx.get(prefRef)]);
          const total = ((userSnap.data()?.unreadTotal as number | undefined) ?? 0) + 1;
          const isMuted = (prefSnap.data()?.muteNotifications as boolean | undefined) === true;
          tx.set(userRef, { unreadTotal: total }, { merge: true });
          tx.set(prefRef, { unreadCount: FieldValue.increment(1) }, { merge: true });
          return { newTotal: total, muted: isMuted };
        });

        if (muted) return;

        const tokensSnap = await db.collection(`users/${userId}/fcmTokens`).get();
        const tokens = tokensSnap.docs
          .map((d) => (d.data() as { token: string }).token)
          .filter(Boolean);
        if (tokens.length === 0) return;

        await getMessaging().sendEachForMulticast({
          tokens,
          notification: {
            title: `${messageData.authorName} in #${channel.name}`,
            body,
          },
          data: { clubId, channelId, screen: "club/chat" },
          apns: { payload: { aps: { sound: "default", badge: newTotal } } },
          android: { priority: "high", notification: { sound: "default" } },
        });
      }),
    );

    await db.doc(`clubs/${clubId}/channels/${channelId}`).update({
      lastMessageAt: event.data?.createTime?.toDate().toISOString() ?? new Date().toISOString(),
    });
  },
);

// ---------------------------------------------------------------------------
// deleteAccount — deletes all user data (sessions, preferences, club memberships)
// and the Firebase Auth account. Uses the Admin SDK so no client re-auth is
// required. Called from the mobile app's account-deletion flow.
// ---------------------------------------------------------------------------
export const deleteAccount = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign-in required");

  const db = getFirestore();
  const adminAuth = getAuth();

  // Delete sessions subcollection in 500-doc batches.
  const sessionsRef = db.collection(`users/${uid}/sessions`);
  let sessionsSnap = await sessionsRef.limit(500).get();
  while (!sessionsSnap.empty) {
    const batch = db.batch();
    for (const d of sessionsSnap.docs) batch.delete(d.ref);
    await batch.commit();
    sessionsSnap = await sessionsRef.limit(500).get();
  }

  // Delete public session copies — these are world-readable denormalized
  // docs and MUST NOT survive account deletion.
  const publicRef = db.collection("publicSessions").where("userId", "==", uid);
  let publicSnap = await publicRef.limit(500).get();
  while (!publicSnap.empty) {
    const batch = db.batch();
    for (const d of publicSnap.docs) batch.delete(d.ref);
    await batch.commit();
    publicSnap = await publicRef.limit(500).get();
  }

  // Delete FCM tokens and channel notification preferences subcollections.
  for (const coll of ["fcmTokens", "channelPreferences"]) {
    const snap = await db.collection(`users/${uid}/${coll}`).limit(500).get();
    if (!snap.empty) {
      const batch = db.batch();
      for (const d of snap.docs) batch.delete(d.ref);
      await batch.commit();
    }
  }

  // Delete Storage objects (GPX tracks, share cards). Best-effort — Storage
  // cleanup must not block the auth-account deletion below.
  await getStorage()
    .bucket()
    .deleteFiles({ prefix: `users/${uid}/` })
    .catch(() => undefined);

  // Remove from all clubs the user belongs to.
  const userClubsSnap = await db.doc(`userClubs/${uid}`).get();
  if (userClubsSnap.exists) {
    const clubIds: string[] =
      (userClubsSnap.data() as { clubIds?: string[] } | undefined)?.clubIds ?? [];
    if (clubIds.length > 0) {
      const batch = db.batch();
      for (const clubId of clubIds) {
        batch.delete(db.doc(`clubs/${clubId}/members/${uid}`));
      }
      await batch.commit();
    }
  }

  // Delete top-level user documents.
  await db.doc(`users/${uid}`).delete().catch(() => undefined);
  await db.doc(`userClubs/${uid}`).delete().catch(() => undefined);

  // Delete the Firebase Auth account last so the function stays authenticated
  // throughout the cleanup above.
  await adminAuth.deleteUser(uid);

  return { success: true };
});

// ---------------------------------------------------------------------------
// migrateMessagesToGeneralChannel — one-time callable (owner only) that copies
// all legacy messages from clubs/{clubId}/messages to the General channel.
// ---------------------------------------------------------------------------
export const migrateMessagesToGeneralChannel = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign-in required");

  const { clubId } = (request.data ?? {}) as { clubId?: unknown };
  if (typeof clubId !== "string" || !clubId) {
    throw new HttpsError("invalid-argument", "clubId is required");
  }

  const db = getFirestore();

  const memberSnap = await db.doc(`clubs/${clubId}/members/${uid}`).get();
  if ((memberSnap.data() as { role?: string } | undefined)?.role !== "owner") {
    throw new HttpsError("permission-denied", "Owner only");
  }

  // Idempotency guard: this is a destructive one-time copy. A marker doc makes
  // re-invocation a no-op so the migration can't re-run and clobber messages
  // that have since been edited/deleted in the General channel.
  const markerRef = db.doc(`clubs/${clubId}/migrations/messagesToGeneralChannel`);
  if ((await markerRef.get()).exists) {
    return { migrated: 0, alreadyMigrated: true };
  }

  const generalChannelRef = db.doc(`clubs/${clubId}/channels/general`);
  const generalSnap = await generalChannelRef.get();
  if (!generalSnap.exists) {
    await generalChannelRef.set({
      id: "general",
      clubId,
      name: "General",
      icon: "chatbubbles-outline",
      iconType: "ionicon",
      description: "",
      isPrivate: false,
      memberIds: [],
      createdBy: uid,
      createdAt: new Date().toISOString(),
      sortOrder: 0,
    });
  }

  const legacySnap = await db.collection(`clubs/${clubId}/messages`).get();
  if (legacySnap.empty) return { migrated: 0 };

  let migrated = 0;
  const docs = legacySnap.docs;
  for (let i = 0; i < docs.length; i += 499) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + 499)) {
      const newRef = db.doc(`clubs/${clubId}/channels/general/messages/${d.id}`);
      batch.set(newRef, { ...d.data(), channelId: "general" });
    }
    await batch.commit();
    migrated += Math.min(499, docs.length - i);
  }

  await markerRef.set({ migratedAt: new Date().toISOString(), by: uid, count: migrated });
  return { migrated };
});
