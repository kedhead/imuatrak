import { getApp, getApps, initializeApp } from "firebase/app";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  FieldPath,
  getCountFromServer,
  getDoc,
  getDocs,
  getFirestore,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { startAppCheck } from "./appCheck";
import { getPublicDoc } from "./firestoreRest";
import type { DashboardSession, PublicSession } from "./types";
import { parseHashtags } from "./clubTypes";
import type { Club, ClubChannel, ClubMember, ClubEvent, ClubMessage, ClubPost, DmMessage, DmThread, MemberRole, EventType, PostType, RsvpStatus } from "./clubTypes";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(config);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

// No-ops on the server and whenever NEXT_PUBLIC_RECAPTCHA_SITE_KEY is unset,
// so this is inert until the key is configured. See lib/appCheck.ts for why
// enforcement must stay off until the mobile client can attest.
startAppCheck(firebaseApp);

/**
 * Read a public session (no auth required).
 *
 * The stored doc is a denormalized copy written by the app (see
 * services/sync.ts `setSessionPublic`), so its shape is only as current as the
 * app version that wrote it — `schemaVersion` exists precisely because that
 * drifts. The viewer indexes straight into `totals`, `hr.zones`, `splits` and
 * `trackSummary`, so casting the snapshot and hoping turned any doc missing
 * one of them into a server-side exception on a public URL.
 *
 * Fill the collection-shaped fields instead. A session that predates a field,
 * or was written without one, then renders what it does have rather than
 * failing the whole page.
 */
export async function getPublicSession(id: string): Promise<PublicSession | null> {
  // Read over REST rather than through the Web SDK — see lib/firestoreRest.ts.
  // This runs in a server component, where the SDK's browser transport is the
  // one thing that differs from the dashboard (which reads the same project
  // fine from the browser).
  const raw = await getPublicDoc(`publicSessions/${id}`, {
    projectId: config.projectId,
    apiKey: config.apiKey,
  });
  if (!raw) return null;
  const data = raw as Partial<PublicSession>;
  return {
    ...(data as PublicSession),
    totals: { ...EMPTY_TOTALS, ...(data.totals ?? {}) },
    hr: { avg: 0, max: 0, ...(data.hr ?? {}), zones: data.hr?.zones ?? [] },
    splits: data.splits ?? [],
    trackSummary: data.trackSummary ?? [],
  };
}

/** Zeroed totals, so a session missing any of them still renders a stat grid. */
const EMPTY_TOTALS = {
  distanceMeters: 0,
  durationSec: 0,
  movingDurationSec: 0,
  avgPaceSecPerKm: 0,
  avgSpeedMps: 0,
  maxSpeedMps: 0,
  strokeCount: 0,
  avgStrokeRate: 0,
  calories: 0,
  elevationGainM: 0,
} as const;

/**
 * Resolve a club from an invite link identifier, which may be either the
 * club document ID (preferred — always unique) or a slug (legacy links).
 * Used by the public /join/[id] landing page; no auth required.
 */
export async function getClubByIdOrSlug(idOrSlug: string): Promise<Club | null> {
  const byId = await getDoc(doc(db, "clubs", idOrSlug));
  if (byId.exists()) return { ...(byId.data() as Omit<Club, "id">), id: byId.id };

  const bySlug = await getDocs(
    query(collection(db, "clubs"), where("slug", "==", idOrSlug), limit(1)),
  );
  if (!bySlug.empty) {
    const d = bySlug.docs[0]!;
    return { ...(d.data() as Omit<Club, "id">), id: d.id };
  }
  return null;
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

/** Get a time-limited download URL for a session's GPX file from Firebase Storage. */
export async function getSessionGpxUrl(storagePath: string): Promise<string> {
  return getDownloadURL(ref(storage, storagePath));
}

/** Delete a session and its public copy from Firestore. */
export async function deleteUserSession(uid: string, session: DashboardSession): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "sessions", session.id));
  if (session.isPublic) {
    await deleteDoc(doc(db, "publicSessions", session.id)).catch(() => undefined);
  }
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

// ── App-admin analytics ──────────────────────────────────────────────────────

/** Shape returned by the getAppStats Cloud Function. */
export interface AppStats {
  generatedAt: string;
  totalUsers: number;
  newUsers7: number;
  newUsers30: number;
  activeUsers7: number;
  activeUsers30: number;
  totalSessions: number;
  sessions7: number;
  sessions30: number;
  clubs: number;
  publicSessions: number;
  /** YYYY-MM-DD → count, last 30 days (days with 0 are absent). */
  signupsByDay: Record<string, number>;
  sessionsByDay: Record<string, number>;
}

/**
 * Whether this user may see the app-analytics admin page. Mirrors the
 * server-side gate in the getAppStats Cloud Function: an admins/{uid} doc,
 * created manually in the Firebase console.
 */
export async function isAppAdmin(uid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, "admins", uid));
    return snap.exists();
  } catch {
    return false;
  }
}

/**
 * Fetch app-wide usage stats. Rejects unless the caller is an app admin.
 *
 * This reads a snapshot rebuilt daily by the computeAppStats scheduled
 * function, not live numbers. The underlying aggregation pages every Auth user
 * and scans every session, so running it per page load made a browser refresh
 * one of the most expensive things anyone could do to the project.
 *
 * Passing refresh forces a rebuild, but the function ignores it if the current
 * snapshot is under an hour old.
 */
export async function fetchAppStats(refresh = false): Promise<AppStats> {
  const fn = httpsCallable<{ refresh: boolean }, AppStats>(
    getFunctions(firebaseApp),
    "getAppStats",
  );
  const res = await fn({ refresh });
  return res.data;
}

// ── Club helpers ─────────────────────────────────────────────────────────────

export async function getUserClub(uid: string): Promise<{ club: Club; role: MemberRole } | null> {
  const ucSnap = await getDoc(doc(db, "userClubs", uid));
  if (!ucSnap.exists()) return null;
  const { activeClubId } = ucSnap.data() as { activeClubId?: string };
  if (!activeClubId) return null;

  const [clubSnap, memberSnap] = await Promise.all([
    getDoc(doc(db, "clubs", activeClubId)),
    getDoc(doc(db, "clubs", activeClubId, "members", uid)),
  ]);
  if (!clubSnap.exists() || !memberSnap.exists()) return null;

  return {
    club: { ...(clubSnap.data() as Club), id: clubSnap.id },
    role: (memberSnap.data() as { role: MemberRole }).role,
  };
}

export async function getClubMembers(clubId: string): Promise<ClubMember[]> {
  const snap = await getDocs(collection(db, "clubs", clubId, "members"));
  return snap.docs.map((d) => d.data() as ClubMember);
}

/**
 * Set or remove a user's RSVP on a club event.
 * Pass status=null to remove the RSVP entirely.
 */
export async function rsvpClubEvent(
  clubId: string,
  eventId: string,
  uid: string,
  status: RsvpStatus | null,
): Promise<void> {
  const ref = doc(db, "clubs", clubId, "events", eventId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as { rsvps?: { uid: string; status: RsvpStatus }[] };
  const rsvps = (data.rsvps ?? []).filter((r) => r.uid !== uid);
  if (status !== null) rsvps.push({ uid, status });
  await updateDoc(ref, { rsvps });
}

export async function getClubEvents(clubId: string): Promise<ClubEvent[]> {
  const snap = await getDocs(
    query(collection(db, "clubs", clubId, "events"), orderBy("startAt"), limit(200)),
  );
  return snap.docs.map((d) => ({ ...(d.data() as Omit<ClubEvent, "id">), id: d.id }));
}

export async function bulkCreateClubEvents(
  clubId: string,
  uid: string,
  opts: {
    title: string;
    type: EventType;
    description?: string;
    location?: string;
    schedule: { dayOfWeek: number; startHour: number; startMinute: number }[];
    durationMinutes: number;
    rangeStart: Date;
    rangeEnd: Date;
  },
): Promise<number> {
  const scheduleMap = new Map(opts.schedule.map((s) => [s.dayOfWeek, s]));
  const events: object[] = [];
  const cur = new Date(opts.rangeStart);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(opts.rangeEnd);
  end.setHours(23, 59, 59, 999);
  while (cur <= end) {
    const sched = scheduleMap.get(cur.getDay());
    if (sched) {
      const startAt = new Date(cur);
      startAt.setHours(sched.startHour, sched.startMinute, 0, 0);
      const endAt = new Date(startAt.getTime() + opts.durationMinutes * 60 * 1000);
      events.push({
        clubId, title: opts.title, type: opts.type,
        description: opts.description ?? "",
        startAt: startAt.toISOString(), endAt: endAt.toISOString(),
        location: opts.location ? { name: opts.location } : null,
        meetTime: "", createdBy: uid, rsvps: [], linkedSessionIds: [],
      });
    }
    cur.setDate(cur.getDate() + 1);
  }
  for (let i = 0; i < events.length; i += 499) {
    const batch = writeBatch(db);
    for (const event of events.slice(i, i + 499)) {
      batch.set(doc(collection(db, "clubs", clubId, "events")), event);
    }
    await batch.commit();
  }
  return events.length;
}

export async function getClubPosts(clubId: string): Promise<ClubPost[]> {
  const snap = await getDocs(
    query(collection(db, "clubs", clubId, "posts"), orderBy("createdAt", "desc"), limit(50)),
  );
  return snap.docs.map((d) => ({ ...(d.data() as Omit<ClubPost, "id">), id: d.id }));
}

export async function createClubPost(
  clubId: string,
  uid: string,
  displayName: string,
  opts: { type: PostType; content: string; pinnedUntil?: string },
): Promise<void> {
  const now = new Date().toISOString();
  await addDoc(collection(db, "clubs", clubId, "posts"), {
    clubId, type: opts.type, content: opts.content,
    authorId: uid, authorName: displayName,
    pinnedUntil: opts.pinnedUntil ?? null,
    likeCount: 0, commentCount: 0,
    createdAt: now, updatedAt: now,
  });
}

export async function deleteClubPost(clubId: string, postId: string): Promise<void> {
  await deleteDoc(doc(db, "clubs", clubId, "posts", postId));
}

export async function createClubEvent(
  clubId: string,
  uid: string,
  opts: { title: string; type: EventType; description?: string; startAt: string; endAt: string; location?: string; meetTime?: string },
): Promise<void> {
  await addDoc(collection(db, "clubs", clubId, "events"), {
    clubId, title: opts.title, type: opts.type,
    description: opts.description ?? "",
    startAt: opts.startAt, endAt: opts.endAt,
    location: opts.location ? { name: opts.location } : null,
    meetTime: opts.meetTime ?? "",
    createdBy: uid, rsvps: [], linkedSessionIds: [],
  });
}

export async function updateClubEvent(
  clubId: string,
  eventId: string,
  updates: Partial<Pick<ClubEvent, "title" | "type" | "description" | "startAt" | "endAt" | "location" | "meetTime">>,
): Promise<void> {
  await updateDoc(doc(db, "clubs", clubId, "events", eventId), updates);
}

export async function deleteClubEvent(clubId: string, eventId: string): Promise<void> {
  await deleteDoc(doc(db, "clubs", clubId, "events", eventId));
}

export async function updateMemberRole(clubId: string, uid: string, role: MemberRole): Promise<void> {
  await updateDoc(doc(db, "clubs", clubId, "members", uid), { role });
}

export async function removeClubMember(clubId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db, "clubs", clubId, "members", uid));
  await updateDoc(doc(db, "clubs", clubId), { memberCount: increment(-1) });
}

export async function updateClub(
  clubId: string,
  updates: Partial<Pick<Club, "name" | "description" | "location" | "logoUrl" | "websiteUrl">> & {
    /** deleteField() clears it — "keep all" is stored as absent, not 0. */
    chatRetentionDays?: number | ReturnType<typeof deleteField>;
  },
): Promise<void> {
  const docRef = doc(db, "clubs", clubId);
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.location !== undefined) payload.location = updates.location;
  if (updates.logoUrl !== undefined) payload.logoUrl = updates.logoUrl;
  if (updates.websiteUrl !== undefined) payload.websiteUrl = updates.websiteUrl;
  if (updates.chatRetentionDays !== undefined) payload.chatRetentionDays = updates.chatRetentionDays;
  if (Object.keys(payload).length > 0) await updateDoc(docRef, payload as Record<string, unknown> & object);
}

export async function uploadClubLogo(clubId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const logoRef = ref(storage, `clubs/${clubId}/logo.${ext}`);
  await uploadBytes(logoRef, file, { contentType: file.type });
  return getDownloadURL(logoRef);
}

// ── Club chat ────────────────────────────────────────────────────────────────
//
// Mirrors src/services/clubService.ts. The Firestore rules that gate channels
// and messages check auth and club membership only, so they apply unchanged to
// a browser client — nothing here needed a rules carve-out for web.

export function subscribeChannels(
  clubId: string,
  uid: string,
  onUpdate: (channels: ClubChannel[]) => void,
): () => void {
  const q = query(collection(db, "clubs", clubId, "channels"), orderBy("sortOrder"));
  return onSnapshot(q, (snap) => {
    const all = snap.docs.map((d) => ({ ...(d.data() as Omit<ClubChannel, "id">), id: d.id }));
    // Everyone can read the channel list, but a private channel should only be
    // offered to its members — the message subcollection would deny them
    // anyway, so showing it would just produce an empty room.
    onUpdate(all.filter((c) => !c.isPrivate || c.memberIds?.includes(uid)));
  });
}

export function subscribeChannelMessages(
  clubId: string,
  channelId: string,
  onUpdate: (msgs: ClubMessage[]) => void,
  msgLimit = 60,
): () => void {
  const q = query(
    collection(db, "clubs", clubId, "channels", channelId, "messages"),
    orderBy("createdAt", "desc"),
    limit(msgLimit),
  );
  // Newest-first with a limit, then reversed for display: ordering ascending
  // would pin the listener to the oldest messages and never surface new ones.
  return onSnapshot(q, (snap) => {
    const msgs = snap.docs.map((d) => ({ ...(d.data() as Omit<ClubMessage, "id">), id: d.id }));
    onUpdate(msgs.reverse());
  });
}

export async function sendChannelMessage(
  clubId: string,
  channelId: string,
  uid: string,
  displayName: string,
  content: string,
  opts: {
    mediaType?: "photo" | "video";
    replyTo?: ClubMessage["replyTo"];
    mentions?: string[];
  } = {},
): Promise<ClubMessage> {
  const { mediaType, replyTo, mentions } = opts;
  const now = new Date().toISOString();
  const msg: Omit<ClubMessage, "id"> = {
    clubId,
    channelId,
    content,
    authorId: uid,
    authorName: displayName,
    ...(replyTo ? { replyTo } : {}),
    ...(mentions?.length ? { mentions: mentions.filter((m) => m !== uid) } : {}),
    createdAt: now,
    ...(mediaType ? { mediaType } : {}),
  };
  const docRef = await addDoc(
    collection(db, "clubs", clubId, "channels", channelId, "messages"),
    msg,
  );
  // lastMessageAt is written by the onChannelMessageCreate trigger, which is
  // authoritative — doing it here too was a second billed write on every
  // message for a value the server was about to set anyway.
  return { ...msg, id: docRef.id };
}

/**
 * Toggle an emoji reaction. Uses FieldPath rather than dot notation because
 * emoji aren't valid unquoted field-path segments; rules restrict member
 * updates to the reactions field alone.
 */
export async function toggleMessageReaction(
  clubId: string,
  channelId: string,
  message: ClubMessage,
  emoji: string,
  uid: string,
): Promise<void> {
  const hasReacted = (message.reactions?.[emoji] ?? []).includes(uid);
  await updateDoc(
    doc(db, "clubs", clubId, "channels", channelId, "messages", message.id),
    new FieldPath("reactions", emoji),
    hasReacted ? arrayRemove(uid) : arrayUnion(uid),
  );
}

/**
 * Delete a message and its attachments.
 *
 * Routed through a Cloud Function rather than deleting the doc directly:
 * multi-image messages record no Storage path (only the "media" key does), so
 * a client-side delete orphans their photos permanently. The function removes
 * the whole message prefix and re-checks author-or-owner/admin server-side.
 */
export async function deleteChannelMessage(
  clubId: string,
  channelId: string,
  messageId: string,
): Promise<void> {
  const fn = httpsCallable<
    { clubId: string; channelId: string; messageId: string },
    { success: boolean }
  >(getFunctions(firebaseApp), "deleteChannelMessage");
  await fn({ clubId, channelId, messageId });
}

/** Pin or unpin a message. Owner/admin only, enforced by the Firestore rule. */
export async function setMessagePinned(
  clubId: string,
  channelId: string,
  messageId: string,
  pinned: boolean,
  uid: string,
): Promise<void> {
  await updateDoc(
    doc(db, "clubs", clubId, "channels", channelId, "messages", messageId),
    pinned
      ? { pinnedAt: new Date().toISOString(), pinnedBy: uid }
      : { pinnedAt: deleteField(), pinnedBy: deleteField() },
  );
}

/**
 * Upper bound on what a retention setting would sweep. Firestore can't filter
 * on an absent field, so pinned messages are counted even though the sweep
 * skips them — present it as "up to N".
 */
export async function countExpiringMessages(clubId: string, days: number): Promise<number> {
  if (days <= 0) return 0;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const channels = await getDocs(collection(db, "clubs", clubId, "channels"));
  const counts = await Promise.all(
    channels.docs.map(async (ch) => {
      const snap = await getCountFromServer(
        query(
          collection(db, "clubs", clubId, "channels", ch.id, "messages"),
          where("createdAt", "<", cutoff),
        ),
      );
      return snap.data().count;
    }),
  );
  return counts.reduce((sum, n) => sum + n, 0);
}

/**
 * Upload one attachment for a message.
 *
 * Goes through the same uploadChannelMedia callable the app uses rather than
 * the Storage SDK, so both clients produce identical download-token URLs and
 * the same server-side membership check applies.
 */
export async function uploadChannelMedia(
  clubId: string,
  channelId: string,
  messageId: string,
  file: File,
  fileKey = "media",
): Promise<string> {
  const base64 = await fileToBase64(file);
  const fn = httpsCallable<
    {
      clubId: string;
      channelId: string;
      messageId: string;
      base64: string;
      contentType: string;
      fileKey?: string;
    },
    { mediaUrl: string }
  >(getFunctions(firebaseApp), "uploadChannelMedia");
  const { data } = await fn({
    clubId,
    channelId,
    messageId,
    base64,
    contentType: file.type,
    fileKey,
  });
  return data.mediaUrl;
}

export async function uploadAvatar(file: File): Promise<string> {
  const base64 = await fileToBase64(file);
  const fn = httpsCallable<{ base64: string; contentType: string }, { avatarUrl: string }>(
    getFunctions(firebaseApp),
    "uploadAvatar",
  );
  const { data } = await fn({ base64, contentType: file.type });
  return data.avatarUrl;
}

/** Strips the `data:<mime>;base64,` prefix the callable doesn't expect. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Clear a channel's unread count and decrement the user's global total.
 *
 * Same transaction as the mobile markChannelRead: the per-channel count is
 * subtracted from the total rather than the total being recomputed, so reading
 * a channel on the web keeps the app's badge honest.
 */
export async function markChannelRead(uid: string, channelId: string): Promise<number> {
  const userRef = doc(db, "users", uid);
  const prefRef = doc(db, "users", uid, "channelPreferences", channelId);
  return runTransaction(db, async (tx) => {
    const [userSnap, prefSnap] = await Promise.all([tx.get(userRef), tx.get(prefRef)]);
    const channelUnread = (prefSnap.data()?.unreadCount as number | undefined) ?? 0;
    const currentTotal = (userSnap.data()?.unreadTotal as number | undefined) ?? 0;
    const newTotal = Math.max(0, currentTotal - channelUnread);
    tx.set(prefRef, { lastReadAt: new Date().toISOString(), unreadCount: 0 }, { merge: true });
    tx.set(userRef, { unreadTotal: newTotal }, { merge: true });
    return newTotal;
  });
}

export function subscribeChannelUnread(
  uid: string,
  channelId: string,
  onUpdate: (count: number) => void,
): () => void {
  return onSnapshot(doc(db, "users", uid, "channelPreferences", channelId), (snap) => {
    onUpdate((snap.data()?.unreadCount as number | undefined) ?? 0);
  });
}

// ── Direct messages ──────────────────────────────────────────────────────────
//
// Mirrors src/services/dmService.ts. The dms rules admit only the two
// participants — there is no admin path here, by design.

export function subscribeDmThreads(
  uid: string,
  onUpdate: (threads: (DmThread & { id: string })[]) => void,
): () => void {
  const q = query(collection(db, "dms"), where("participants", "array-contains", uid), limit(100));
  return onSnapshot(q, (snap) => {
    const threads = snap.docs.map((d) => ({ ...(d.data() as DmThread), id: d.id }));
    // Sorted client-side: ordering on lastMessageAt would need a composite
    // index, and a brand-new thread has none, so it would vanish from the list
    // until someone spoke.
    threads.sort((a, b) =>
      (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt),
    );
    onUpdate(threads);
  });
}

export function subscribeDmMessages(
  threadId: string,
  onUpdate: (msgs: DmMessage[]) => void,
  msgLimit = 60,
): () => void {
  const q = query(
    collection(db, "dms", threadId, "messages"),
    orderBy("createdAt", "desc"),
    limit(msgLimit),
  );
  return onSnapshot(q, (snap) => {
    const msgs = snap.docs.map((d) => ({ ...(d.data() as Omit<DmMessage, "id">), id: d.id }));
    onUpdate(msgs.reverse());
  });
}

/** Find or create the thread with another user. Server-checked: you may only
 *  message someone you share a club with. */
export async function openDmThread(otherUid: string): Promise<string> {
  const fn = httpsCallable<{ otherUid: string }, { threadId: string }>(
    getFunctions(firebaseApp),
    "openDmThread",
  );
  const { data } = await fn({ otherUid });
  return data.threadId;
}

export async function sendDmMessage(
  threadId: string,
  uid: string,
  displayName: string,
  content: string,
): Promise<DmMessage> {
  const now = new Date().toISOString();
  const msg: Omit<DmMessage, "id"> = {
    threadId,
    content,
    authorId: uid,
    authorName: displayName,
    createdAt: now,
  };
  const ref = await addDoc(collection(db, "dms", threadId, "messages"), msg);
  void updateDoc(doc(db, "dms", threadId), {
    lastMessageAt: now,
    lastMessagePreview: content.slice(0, 80),
  }).catch(() => undefined);
  return { ...msg, id: ref.id };
}

export async function toggleDmReaction(
  threadId: string,
  message: DmMessage,
  emoji: string,
  uid: string,
): Promise<void> {
  const hasReacted = (message.reactions?.[emoji] ?? []).includes(uid);
  await updateDoc(
    doc(db, "dms", threadId, "messages", message.id),
    new FieldPath("reactions", emoji),
    hasReacted ? arrayRemove(uid) : arrayUnion(uid),
  );
}

/** Your own messages only — a private thread has no moderator. */
export async function deleteDmMessage(threadId: string, messageId: string): Promise<void> {
  await deleteDoc(doc(db, "dms", threadId, "messages", messageId));
}

/**
 * Live unread counts per DM thread. Only threads with something unread are
 * returned; callers already treat a missing key as zero.
 *
 * The query filters and caps server-side rather than reading every thread and
 * discarding the zeros in the client. A listener bills a read per document it
 * delivers, including the whole initial payload every time it re-subscribes,
 * so filtering here is the difference between paying for the threads that
 * matter and paying for every conversation the user has ever had.
 */
export function subscribeDmUnread(
  uid: string,
  onUpdate: (byThread: Record<string, number>) => void,
): () => void {
  const q = query(
    collection(db, "users", uid, "dmThreads"),
    where("unreadCount", ">", 0),
    limit(200),
  );
  return onSnapshot(q, (snap) => {
    const map: Record<string, number> = {};
    for (const d of snap.docs) {
      const count = (d.data() as { unreadCount?: number }).unreadCount ?? 0;
      if (count > 0) map[d.id] = count;
    }
    onUpdate(map);
  });
}

/** Clear a thread's unread count and decrement the shared global total. */
export async function markDmRead(uid: string, threadId: string): Promise<number> {
  const userRef = doc(db, "users", uid);
  const prefRef = doc(db, "users", uid, "dmThreads", threadId);
  return runTransaction(db, async (tx) => {
    const [userSnap, prefSnap] = await Promise.all([tx.get(userRef), tx.get(prefRef)]);
    const threadUnread = (prefSnap.data()?.unreadCount as number | undefined) ?? 0;
    const currentTotal = (userSnap.data()?.unreadTotal as number | undefined) ?? 0;
    const newTotal = Math.max(0, currentTotal - threadUnread);
    tx.set(prefRef, { lastReadAt: new Date().toISOString(), unreadCount: 0 }, { merge: true });
    tx.set(userRef, { unreadTotal: newTotal }, { merge: true });
    return newTotal;
  });
}

// ── Club gallery ─────────────────────────────────────────────────────────────
//
// Photo posts share the posts collection with the Team Updates feed, so likes
// and comments reuse the post plumbing — see the PostType comment in
// src/models/club.ts.

/** Photo posts, newest first. Needs the posts type+createdAt composite index. */
export async function getGalleryPosts(clubId: string, maxItems = 60): Promise<ClubPost[]> {
  const snap = await getDocs(
    query(
      collection(db, "clubs", clubId, "posts"),
      where("type", "==", "photo"),
      orderBy("createdAt", "desc"),
      limit(maxItems),
    ),
  );
  return snap.docs.map((d) => ({ ...(d.data() as Omit<ClubPost, "id">), id: d.id }));
}

/** Create an empty photo post; photos are attached by uploadPostMedia. */
export async function createPhotoPost(
  clubId: string,
  uid: string,
  displayName: string,
  content = "",
  taggedUids: string[] = [],
): Promise<string> {
  const now = new Date().toISOString();
  const tags = parseHashtags(content);
  const ref = await addDoc(collection(db, "clubs", clubId, "posts"), {
    clubId,
    type: "photo",
    content,
    authorId: uid,
    authorName: displayName,
    likeCount: 0,
    commentCount: 0,
    createdAt: now,
    updatedAt: now,
    // Omitted when empty rather than stored as []: Firestore can't tell the two
    // apart on read, and absent keeps the documents smaller.
    ...(tags.length ? { tags } : {}),
    ...(taggedUids.length ? { taggedUids } : {}),
  });
  return ref.id;
}

/** Attach one photo to a post, via the same callable the app uses. */
export async function uploadPostMedia(
  clubId: string,
  postId: string,
  file: File,
  fileKey = "media",
): Promise<string> {
  const base64 = await fileToBase64(file);
  const fn = httpsCallable<
    { clubId: string; postId: string; base64: string; contentType: string; fileKey?: string },
    { mediaUrl: string }
  >(getFunctions(firebaseApp), "uploadPostMedia");
  const { data } = await fn({ clubId, postId, base64, contentType: file.type, fileKey });
  return data.mediaUrl;
}

/**
 * Delete a post and its photos.
 *
 * Routed through a Cloud Function: deleting the doc directly would orphan
 * every attached photo in Storage. The function re-checks author-or-owner/admin
 * server-side.
 */
export async function deleteClubPostWithMedia(clubId: string, postId: string): Promise<void> {
  const fn = httpsCallable<{ clubId: string; postId: string }, { success: boolean }>(
    getFunctions(firebaseApp),
    "deleteClubPost",
  );
  await fn({ clubId, postId });
}

export async function togglePostLike(
  clubId: string,
  postId: string,
  uid: string,
): Promise<void> {
  const ref = doc(db, "clubs", clubId, "posts", postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const alreadyLiked = ((snap.data() as { likedBy?: string[] }).likedBy ?? []).includes(uid);
  await updateDoc(ref, {
    likedBy: alreadyLiked ? arrayRemove(uid) : arrayUnion(uid),
    likeCount: increment(alreadyLiked ? -1 : 1),
  });
}

export async function getPostComments(clubId: string, postId: string) {
  const snap = await getDocs(
    query(collection(db, "clubs", clubId, "posts", postId, "comments"), orderBy("createdAt")),
  );
  return snap.docs.map((d) => ({
    ...(d.data() as { content: string; authorId: string; authorName: string; createdAt: string }),
    id: d.id,
  }));
}

export async function addPostComment(
  clubId: string,
  postId: string,
  uid: string,
  displayName: string,
  content: string,
): Promise<void> {
  await addDoc(collection(db, "clubs", clubId, "posts", postId, "comments"), {
    content,
    authorId: uid,
    authorName: displayName,
    createdAt: new Date().toISOString(),
  });
  await updateDoc(doc(db, "clubs", clubId, "posts", postId), { commentCount: increment(1) });
}
