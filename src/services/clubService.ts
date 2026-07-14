import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  arrayUnion,
  arrayRemove,
  increment,
  writeBatch,
  runTransaction,
  Timestamp,
  onSnapshot,
} from "firebase/firestore";
import * as FileSystem from "expo-file-system/legacy";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "./firebase";
import type {
  BoatAssignment,
  Club,
  ClubMember,
  ClubEvent,
  ClubPost,
  ClubComment,
  ClubMessage,
  ClubChannel,
  ChannelPreference,
  FcmToken,
  MemberRole,
  EventType,
  PostType,
  PollOption,
  RsvpStatus,
  UserClubs,
} from "@/models/club";

// ── Helpers ──────────────────────────────────────────────────────────────────

function toIso(ts: unknown): string {
  if (ts instanceof Timestamp) return ts.toDate().toISOString();
  if (typeof ts === "string") return ts;
  return new Date().toISOString();
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

// ── UserClubs index ──────────────────────────────────────────────────────────

export async function getUserClubs(uid: string): Promise<UserClubs | null> {
  const snap = await getDoc(doc(db, "userClubs", uid));
  if (!snap.exists()) return null;
  return snap.data() as UserClubs;
}

async function addClubToIndex(uid: string, clubId: string): Promise<void> {
  const ref = doc(db, "userClubs", uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { clubIds: arrayUnion(clubId), activeClubId: clubId });
  } else {
    await setDoc(ref, { clubIds: [clubId], activeClubId: clubId });
  }
}

async function removeClubFromIndex(uid: string, clubId: string): Promise<void> {
  const ref = doc(db, "userClubs", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as UserClubs;
  const clubIds = data.clubIds.filter((id) => id !== clubId);
  const activeClubId = data.activeClubId === clubId ? (clubIds[0] ?? "") : data.activeClubId;
  await setDoc(ref, { clubIds, activeClubId });
}

// ── Club CRUD ────────────────────────────────────────────────────────────────

export async function createClub(
  uid: string,
  displayName: string,
  opts: { name: string; description: string; city: string; country: string },
): Promise<Club> {
  const id = doc(collection(db, "clubs")).id;
  const now = new Date().toISOString();
  const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const club: Club = {
    id,
    name: opts.name,
    slug: slugify(opts.name),
    description: opts.description,
    sport: "outrigger",
    location: { city: opts.city, country: opts.country },
    ownerId: uid,
    subscriptionStatus: "trial",
    subscriptionTier: "basic",
    trialEndsAt,
    // Starts at 0; the onMemberJoin trigger increments to 1 when the owner's
    // member doc is created below. Counting it here too would double it.
    memberCount: 0,
    createdAt: now,
  };

  await setDoc(doc(db, "clubs", id), club);

  const ownerMember: ClubMember = {
    uid,
    role: "owner",
    displayName,
    joinedAt: now,
  };
  await setDoc(doc(db, "clubs", id, "members", uid), ownerMember);
  await addClubToIndex(uid, id);

  return club;
}

export async function getClub(clubId: string): Promise<Club | null> {
  const snap = await getDoc(doc(db, "clubs", clubId));
  if (!snap.exists()) return null;
  return snap.data() as Club;
}

export async function updateClub(
  clubId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  await updateDoc(doc(db, "clubs", clubId), updates as Record<string, unknown> & object);
}

export async function updateMemberDisplayName(
  clubId: string,
  uid: string,
  displayName: string,
): Promise<void> {
  await updateDoc(doc(db, "clubs", clubId, "members", uid), { displayName });
}

/**
 * Propagate a user's display name to their member doc in EVERY club they
 * belong to. Called after the name is set (onboarding name gate or Settings)
 * so the denormalized roster copy never lags behind the profile.
 */
export async function syncMemberDisplayName(uid: string, displayName: string): Promise<void> {
  const userClubs = await getUserClubs(uid);
  if (!userClubs?.clubIds?.length) return;
  await Promise.all(
    userClubs.clubIds.map((clubId) =>
      updateMemberDisplayName(clubId, uid, displayName).catch(() => undefined),
    ),
  );
}

// ── Members ──────────────────────────────────────────────────────────────────

export async function getClubMembers(clubId: string): Promise<ClubMember[]> {
  const snap = await getDocs(collection(db, "clubs", clubId, "members"));
  return snap.docs.map((d) => d.data() as ClubMember);
}

export async function getMyRole(clubId: string, uid: string): Promise<MemberRole | null> {
  const snap = await getDoc(doc(db, "clubs", clubId, "members", uid));
  if (!snap.exists()) return null;
  return (snap.data() as ClubMember).role;
}

export async function joinClub(
  clubId: string,
  uid: string,
  displayName: string,
  invitedBy?: string,
): Promise<void> {
  const memberRef = doc(db, "clubs", clubId, "members", uid);
  const existing = await getDoc(memberRef);
  if (existing.exists()) return; // Already a member — never overwrite an existing role

  const member: ClubMember = {
    uid,
    role: "member",
    displayName,
    joinedAt: new Date().toISOString(),
    // Only include invitedBy when set — Firestore rejects `undefined` values.
    ...(invitedBy ? { invitedBy } : {}),
  };
  await setDoc(memberRef, member);
  await addClubToIndex(uid, clubId);
  // memberCount is incremented server-side by the onMemberJoin trigger when the
  // member doc is created above. Do not also increment here — increment() is
  // additive, not idempotent, so a client increment would double-count joins.
}

export async function leaveClub(clubId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db, "clubs", clubId, "members", uid));
  await removeClubFromIndex(uid, clubId);
  // memberCount is decremented server-side by the onMemberLeave trigger when
  // the member doc is deleted above — same single-writer pattern as joins.
}

export async function updateMemberRole(
  clubId: string,
  uid: string,
  role: MemberRole,
): Promise<void> {
  await updateDoc(doc(db, "clubs", clubId, "members", uid), { role });
}

export async function removeMember(clubId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db, "clubs", clubId, "members", uid));
  // memberCount handled by the onMemberLeave trigger.
}

// ── Invite links ─────────────────────────────────────────────────────────────

export async function createInviteToken(clubId: string): Promise<string> {
  const fn = httpsCallable<{ clubId: string }, { token: string }>(functions, "createClubInvite");
  const result = await fn({ clubId });
  return result.data.token;
}

export async function resolveInviteToken(token: string): Promise<string | null> {
  const snap = await getDoc(doc(db, "clubInvites", token));
  if (!snap.exists()) return null;
  const data = snap.data() as { clubId: string; expiresAt: string };
  if (new Date(data.expiresAt) < new Date()) return null;
  return data.clubId;
}

// ── Events ───────────────────────────────────────────────────────────────────

export async function getUpcomingEvents(clubId: string, maxItems = 10): Promise<ClubEvent[]> {
  const now = new Date().toISOString();
  const snap = await getDocs(
    query(
      collection(db, "clubs", clubId, "events"),
      where("startAt", ">=", now),
      orderBy("startAt"),
      limit(maxItems),
    ),
  );
  return snap.docs.map((d) => ({ ...(d.data() as Omit<ClubEvent, "id">), id: d.id }));
}

export async function getPastEvents(clubId: string, maxItems = 20): Promise<ClubEvent[]> {
  const now = new Date().toISOString();
  const snap = await getDocs(
    query(
      collection(db, "clubs", clubId, "events"),
      where("endAt", "<", now),
      orderBy("endAt", "desc"),
      limit(maxItems),
    ),
  );
  return snap.docs.map((d) => ({ ...(d.data() as Omit<ClubEvent, "id">), id: d.id }));
}

export async function getEvent(clubId: string, eventId: string): Promise<ClubEvent | null> {
  const snap = await getDoc(doc(db, "clubs", clubId, "events", eventId));
  if (!snap.exists()) return null;
  return { ...(snap.data() as Omit<ClubEvent, "id">), id: snap.id };
}

export async function createEvent(
  clubId: string,
  uid: string,
  opts: {
    title: string;
    description?: string;
    type: EventType;
    startAt: string;
    endAt: string;
    location?: { name: string; lat?: number; lon?: number };
    meetTime?: string;
    meetLocation?: string;
    maxParticipants?: number;
    boatAssignments?: BoatAssignment[];
  },
): Promise<ClubEvent> {
  const event: Omit<ClubEvent, "id"> = {
    clubId,
    title: opts.title,
    type: opts.type,
    startAt: opts.startAt,
    endAt: opts.endAt,
    createdBy: uid,
    rsvps: [],
    ...(opts.description !== undefined ? { description: opts.description } : {}),
    ...(opts.location !== undefined ? { location: opts.location } : {}),
    ...(opts.meetTime !== undefined ? { meetTime: opts.meetTime } : {}),
    ...(opts.meetLocation !== undefined ? { meetLocation: opts.meetLocation } : {}),
    ...(opts.maxParticipants !== undefined ? { maxParticipants: opts.maxParticipants } : {}),
    ...(opts.boatAssignments !== undefined ? { boatAssignments: opts.boatAssignments } : {}),
    linkedSessionIds: [],
  };
  const ref = await addDoc(collection(db, "clubs", clubId, "events"), event);
  return { ...event, id: ref.id };
}

export async function updateEvent(
  clubId: string,
  eventId: string,
  updates: Partial<Omit<ClubEvent, "id" | "clubId" | "createdBy" | "rsvps" | "linkedSessionIds">>,
): Promise<void> {
  await updateDoc(doc(db, "clubs", clubId, "events", eventId), updates);
}

export async function deleteEvent(clubId: string, eventId: string): Promise<void> {
  await deleteDoc(doc(db, "clubs", clubId, "events", eventId));
}

export async function updateBoatAssignments(
  clubId: string,
  eventId: string,
  boatAssignments: BoatAssignment[],
): Promise<void> {
  await updateDoc(doc(db, "clubs", clubId, "events", eventId), { boatAssignments });
}

export async function bulkCreateEvents(
  clubId: string,
  uid: string,
  opts: {
    title: string;
    type: EventType;
    schedule: { dayOfWeek: number; startHour: number; startMinute: number }[];
    durationMinutes: number;
    rangeStart: Date;
    rangeEnd: Date;
    description?: string;
    location?: string;
  },
): Promise<number> {
  const scheduleMap = new Map(opts.schedule.map((s) => [s.dayOfWeek, s]));

  const events: Omit<ClubEvent, "id">[] = [];
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
        clubId,
        title: opts.title,
        type: opts.type,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        createdBy: uid,
        rsvps: [],
        linkedSessionIds: [],
        // Only include optional fields when they have a value — Firestore
        // rejects undefined in WriteBatch.set() with an unsupported-field error.
        ...(opts.description ? { description: opts.description } : {}),
        ...(opts.location ? { location: { name: opts.location } } : {}),
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

export async function setRsvp(
  clubId: string,
  eventId: string,
  uid: string,
  status: RsvpStatus,
): Promise<void> {
  const ref = doc(db, "clubs", clubId, "events", eventId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const event = snap.data() as Omit<ClubEvent, "id">;
  const rsvps = event.rsvps.filter((r) => r.uid !== uid);
  rsvps.push({ uid, status, updatedAt: new Date().toISOString() });
  await updateDoc(ref, { rsvps });
}

// ── Posts ────────────────────────────────────────────────────────────────────

export async function getPosts(clubId: string, maxItems = 30): Promise<ClubPost[]> {
  const snap = await getDocs(
    query(
      collection(db, "clubs", clubId, "posts"),
      orderBy("createdAt", "desc"),
      limit(maxItems),
    ),
  );
  return snap.docs.map((d) => ({ ...(d.data() as Omit<ClubPost, "id">), id: d.id }));
}

export async function createPost(
  clubId: string,
  uid: string,
  displayName: string,
  opts: {
    type: PostType;
    content: string;
    linkedSessionId?: string;
    pinnedUntil?: string;
    pollOptions?: PollOption[];
    pollMultipleChoice?: boolean;
    pollEndsAt?: string;
  },
): Promise<ClubPost> {
  const now = new Date().toISOString();
  const post: Omit<ClubPost, "id"> = {
    clubId,
    type: opts.type,
    content: opts.content,
    authorId: uid,
    authorName: displayName,
    likeCount: 0,
    commentCount: 0,
    createdAt: now,
    updatedAt: now,
    ...(opts.pinnedUntil !== undefined && { pinnedUntil: opts.pinnedUntil }),
    ...(opts.linkedSessionId !== undefined && { linkedSessionId: opts.linkedSessionId }),
    ...(opts.type === "poll" && opts.pollOptions && {
      pollOptions: opts.pollOptions,
      pollVotes: {},
      pollMultipleChoice: opts.pollMultipleChoice ?? false,
      ...(opts.pollEndsAt !== undefined && { pollEndsAt: opts.pollEndsAt }),
    }),
  };
  const ref = await addDoc(collection(db, "clubs", clubId, "posts"), post);
  return { ...post, id: ref.id };
}

export async function votePoll(
  clubId: string,
  postId: string,
  uid: string,
  optionIndex: number,
  currentVotes: Record<string, string[]>,
  multipleChoice: boolean,
): Promise<void> {
  const ref = doc(db, "clubs", clubId, "posts", postId);
  const key = String(optionIndex);

  if (multipleChoice) {
    const already = (currentVotes[key] ?? []).includes(uid);
    await updateDoc(ref, {
      [`pollVotes.${key}`]: already ? arrayRemove(uid) : arrayUnion(uid),
    });
  } else {
    const updates: Record<string, ReturnType<typeof arrayUnion>> = {};
    // Remove from any other option the user already voted for
    Object.keys(currentVotes).forEach((k) => {
      if (k !== key && (currentVotes[k] ?? []).includes(uid)) {
        updates[`pollVotes.${k}`] = arrayRemove(uid);
      }
    });
    const already = (currentVotes[key] ?? []).includes(uid);
    updates[`pollVotes.${key}`] = already ? arrayRemove(uid) : arrayUnion(uid);
    await updateDoc(ref, updates);
  }
}

export async function deletePost(clubId: string, postId: string): Promise<void> {
  await deleteDoc(doc(db, "clubs", clubId, "posts", postId));
}

export async function toggleLike(
  clubId: string,
  postId: string,
  uid: string,
): Promise<{ liked: boolean }> {
  const ref = doc(db, "clubs", clubId, "posts", postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { liked: false };
  const data = snap.data() as { likedBy?: string[] };
  const alreadyLiked = (data.likedBy ?? []).includes(uid);
  await updateDoc(ref, {
    likedBy: alreadyLiked ? arrayRemove(uid) : arrayUnion(uid),
    likeCount: increment(alreadyLiked ? -1 : 1),
  });
  return { liked: !alreadyLiked };
}

export async function getComments(clubId: string, postId: string): Promise<ClubComment[]> {
  const snap = await getDocs(
    query(
      collection(db, "clubs", clubId, "posts", postId, "comments"),
      orderBy("createdAt"),
    ),
  );
  return snap.docs.map((d) => ({ ...(d.data() as Omit<ClubComment, "id">), id: d.id }));
}

export async function addComment(
  clubId: string,
  postId: string,
  uid: string,
  displayName: string,
  content: string,
): Promise<ClubComment> {
  const comment: Omit<ClubComment, "id"> = {
    content,
    authorId: uid,
    authorName: displayName,
    createdAt: new Date().toISOString(),
  };
  const ref = await addDoc(
    collection(db, "clubs", clubId, "posts", postId, "comments"),
    comment,
  );
  await updateDoc(doc(db, "clubs", clubId, "posts", postId), {
    commentCount: increment(1),
  });
  return { ...comment, id: ref.id };
}

export async function getClubBySlug(slug: string): Promise<Club | null> {
  const snap = await getDocs(
    query(collection(db, "clubs"), where("slug", "==", slug), limit(1)),
  );
  if (snap.empty) return null;
  const d = snap.docs[0]!;
  return { ...(d.data() as Omit<Club, "id">), id: d.id };
}

// ── Club channels ─────────────────────────────────────────────────────────────

export function subscribeChannels(
  clubId: string,
  onUpdate: (channels: ClubChannel[]) => void,
): () => void {
  const q = query(
    collection(db, "clubs", clubId, "channels"),
    orderBy("sortOrder", "asc"),
  );
  return onSnapshot(q, (snap) => {
    const channels = snap.docs.map(
      (d) => ({ ...(d.data() as Omit<ClubChannel, "id">), id: d.id }),
    );
    onUpdate(channels);
  });
}

export async function getChannel(clubId: string, channelId: string): Promise<ClubChannel | null> {
  const snap = await getDoc(doc(db, "clubs", clubId, "channels", channelId));
  if (!snap.exists()) return null;
  return { ...(snap.data() as Omit<ClubChannel, "id">), id: snap.id };
}

export async function updateChannel(
  clubId: string,
  channelId: string,
  updates: Partial<Pick<ClubChannel, "name" | "icon" | "iconType" | "description" | "sortOrder">>,
): Promise<void> {
  await updateDoc(doc(db, "clubs", clubId, "channels", channelId), updates);
}

export async function deleteChannel(clubId: string, channelId: string): Promise<void> {
  await deleteDoc(doc(db, "clubs", clubId, "channels", channelId));
}

export async function addChannelMember(clubId: string, channelId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, "clubs", clubId, "channels", channelId), {
    memberIds: arrayUnion(uid),
  });
}

export async function removeChannelMember(clubId: string, channelId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, "clubs", clubId, "channels", channelId), {
    memberIds: arrayRemove(uid),
  });
}

// ── Club chat (channel-scoped) ─────────────────────────────────────────────────

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
  return onSnapshot(q, (snap) => {
    // Fetch the most recent `msgLimit` messages (descending), then reverse to
    // oldest→newest for the caller. An ascending order + limit would pin the
    // listener to the first messages ever sent and never surface new ones.
    const msgs = snap.docs.map(
      (d) => ({ ...(d.data() as Omit<ClubMessage, "id">), id: d.id }),
    );
    onUpdate(msgs.reverse());
  });
}

export async function sendMessage(
  clubId: string,
  channelId: string,
  uid: string,
  displayName: string,
  content: string,
  mediaType?: "photo" | "video",
): Promise<ClubMessage> {
  const now = new Date().toISOString();
  const msg: Omit<ClubMessage, "id"> = {
    clubId,
    channelId,
    content,
    authorId: uid,
    authorName: displayName,
    createdAt: now,
    ...(mediaType ? { mediaType } : {}),
  };
  const ref = await addDoc(
    collection(db, "clubs", clubId, "channels", channelId, "messages"),
    msg,
  );
  // Update lastMessageAt on the channel for unread indicators
  void updateDoc(doc(db, "clubs", clubId, "channels", channelId), {
    lastMessageAt: now,
  }).catch(() => undefined);
  return { ...msg, id: ref.id };
}

export async function uploadMessageMedia(
  clubId: string,
  channelId: string,
  messageId: string,
  localUri: string,
  mimeType: string,
): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("not signed in");
  const token = await user.getIdToken();

  const ext = mimeType.split("/")[1] ?? "bin";
  const bucket = "imuatrak.firebasestorage.app";
  const path = `clubs/${clubId}/channels/${channelId}/messages/${messageId}/media.${ext}`;
  const uploadUrl =
    `https://firebasestorage.googleapis.com/v0/b/` +
    `${encodeURIComponent(bucket)}/o` +
    `?uploadType=media&name=${encodeURIComponent(path)}`;

  const upload = await FileSystem.uploadAsync(uploadUrl, localUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": mimeType },
  });

  if (upload.status < 200 || upload.status >= 300) {
    throw new Error(`Upload failed: HTTP ${upload.status}`);
  }

  const meta = JSON.parse(upload.body) as { downloadTokens?: string };
  const downloadToken = meta.downloadTokens?.split(",")[0];
  if (!downloadToken) throw new Error("No download token in Storage response");

  const mediaUrl =
    `https://firebasestorage.googleapis.com/v0/b/` +
    `${encodeURIComponent(bucket)}/o/${encodeURIComponent(path)}` +
    `?alt=media&token=${downloadToken}`;

  await updateDoc(
    doc(db, "clubs", clubId, "channels", channelId, "messages", messageId),
    { mediaUrl, mediaStoragePath: `gs://${bucket}/${path}` },
  );

  return mediaUrl;
}

// ── Channel preferences & FCM ─────────────────────────────────────────────────

export async function registerFcmToken(
  uid: string,
  token: string,
  platform: "ios" | "android",
): Promise<void> {
  const entry: FcmToken = { token, platform, updatedAt: new Date().toISOString() };
  await setDoc(doc(db, "users", uid, "fcmTokens", token), entry);
}

export async function getChannelPreferences(
  uid: string,
): Promise<Map<string, ChannelPreference>> {
  const snap = await getDocs(collection(db, "users", uid, "channelPreferences"));
  const map = new Map<string, ChannelPreference>();
  snap.docs.forEach((d) => {
    map.set(d.id, d.data() as ChannelPreference);
  });
  return map;
}

export async function setChannelPreference(
  uid: string,
  channelId: string,
  prefs: Partial<ChannelPreference>,
): Promise<void> {
  await setDoc(doc(db, "users", uid, "channelPreferences", channelId), prefs, { merge: true });
}

/**
 * Mark a channel read: stamp lastReadAt, zero this channel's unread count, and
 * subtract that amount from the user's global unread total (which drives the
 * app-icon badge). One transaction so the total can't drift. Returns the new
 * global total so the caller can update the app badge.
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

/** Current global unread total for the app-icon badge (0 if unset). */
export async function getUnreadTotal(uid: string): Promise<number> {
  const snap = await getDoc(doc(db, "users", uid));
  return Math.max(0, (snap.data()?.unreadTotal as number | undefined) ?? 0);
}
