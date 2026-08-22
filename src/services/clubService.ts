import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  getCountFromServer,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  arrayUnion,
  arrayRemove,
  FieldPath,
  increment,
  writeBatch,
  runTransaction,
  Timestamp,
  onSnapshot,
  type FieldValue,
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
  PaddleSide,
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

/** Persist which of the user's clubs the app should show (multi-club). */
export async function setActiveClub(uid: string, clubId: string): Promise<void> {
  await updateDoc(doc(db, "userClubs", uid), { activeClubId: clubId });
}

// ── Club CRUD ────────────────────────────────────────────────────────────────

export async function createClub(
  uid: string,
  displayName: string,
  opts: { name: string; description: string; city: string; country: string },
): Promise<Club> {
  const id = doc(collection(db, "clubs")).id;
  const now = new Date().toISOString();

  const club: Club = {
    id,
    name: opts.name,
    slug: slugify(opts.name),
    description: opts.description,
    sport: "outrigger",
    location: { city: opts.city, country: opts.country },
    ownerId: uid,
    // New clubs start on the free plan — ads shown, Pro locked. No automatic
    // trial: the owner either subscribes or opts into a trial explicitly.
    subscriptionStatus: "free",
    subscriptionTier: "basic",
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
  // Take `id` from the document path, not the stored field. They agree for
  // every club createClub wrote, but a club restored from an export or seeded
  // by hand can be missing it — and an undefined id turns a perfectly good
  // invite into an unexplained Firestore error at join time.
  return { ...(snap.data() as Omit<Club, "id">), id: snap.id };
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

/**
 * Propagate a paddler's profile fields (birthday, paddling side) to their
 * member doc in every club they belong to, so rosters and lineups everywhere
 * see the same values. A member may write these on their own doc per the
 * Firestore rules (role/uid unchanged).
 */
export async function syncMemberProfile(
  uid: string,
  fields: { birthday?: string; paddleSide?: PaddleSide },
): Promise<void> {
  const userClubs = await getUserClubs(uid);
  if (!userClubs?.clubIds?.length) return;
  // Firestore rejects `undefined` field values, so an unset field must be sent
  // as deleteField() — which both avoids the crash and correctly clears a value
  // the user removed (the X on birthday, tapping a selected side off).
  const payload: Record<string, string | FieldValue> = {
    birthday: fields.birthday ?? deleteField(),
    paddleSide: fields.paddleSide ?? deleteField(),
  };
  await Promise.all(
    userClubs.clubIds.map((clubId) =>
      updateDoc(doc(db, "clubs", clubId, "members", uid), payload).catch(() => undefined),
    ),
  );
}

/**
 * Upload a profile photo and apply it across every club the user is in.
 *
 * The Cloud Function does the storage write and the roster fan-out (see
 * uploadAvatar in firebase/functions) — the client only reads the file, for
 * the same Blob reason uploadMessageMedia goes server-side.
 */
export async function uploadAvatar(localUri: string, mimeType: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("not signed in");

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const fn = httpsCallable<{ base64: string; contentType: string }, { avatarUrl: string }>(
    functions,
    "uploadAvatar",
  );
  const { data } = await fn({ base64, contentType: mimeType });
  return data.avatarUrl;
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

/**
 * Add the user to a club. Returns which of the two things happened so the
 * join screen can say "welcome" or "you're already in" instead of claiming a
 * fresh join every time someone re-taps an invite they already used.
 */
export async function joinClub(
  clubId: string,
  uid: string,
  displayName: string,
  invitedBy?: string,
): Promise<"joined" | "already-a-member"> {
  const memberRef = doc(db, "clubs", clubId, "members", uid);
  const existing = await getDoc(memberRef);
  if (existing.exists()) {
    // Never overwrite an existing role — but still point the app at this club,
    // otherwise tapping an invite for a club you already belong to appears to
    // do nothing at all.
    await addClubToIndex(uid, clubId);
    return "already-a-member";
  }

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
  return "joined";
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

/**
 * Start the club's one-time, opt-in 7-day free trial. Server-side (billing
 * fields are not client-writable); throws if the club already used its trial
 * or isn't on the free plan.
 */
export async function startClubTrial(clubId: string): Promise<{ trialEndsAt: string }> {
  const fn = httpsCallable<{ clubId: string }, { status: string; trialEndsAt: string }>(
    functions,
    "startClubTrial",
  );
  const { data } = await fn({ clubId });
  return { trialEndsAt: data.trialEndsAt };
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

// Events are bucketed by their start DAY, not the current instant: an event
// stays "upcoming" (and reachable, so the boat lineup is visible) from the
// start of its day right through practice, and only moves to "past" once the
// day rolls over. Keying off `now` instead dropped an in-progress practice out
// of both lists — invisible while it was actually happening.
function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function getUpcomingEvents(clubId: string, maxItems = 10): Promise<ClubEvent[]> {
  const snap = await getDocs(
    query(
      collection(db, "clubs", clubId, "events"),
      where("startAt", ">=", startOfTodayISO()),
      orderBy("startAt"),
      limit(maxItems),
    ),
  );
  return snap.docs.map((d) => ({ ...(d.data() as Omit<ClubEvent, "id">), id: d.id }));
}

export async function getPastEvents(clubId: string, maxItems = 20): Promise<ClubEvent[]> {
  const snap = await getDocs(
    query(
      collection(db, "clubs", clubId, "events"),
      where("startAt", "<", startOfTodayISO()),
      orderBy("startAt", "desc"),
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
  guests?: string[],
): Promise<void> {
  const ref = doc(db, "clubs", clubId, "events", eventId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const event = snap.data() as Omit<ClubEvent, "id">;
  const existing = event.rsvps.find((r) => r.uid === uid);
  const rsvps = event.rsvps.filter((r) => r.uid !== uid);
  // Guests survive status flip-flops (going → maybe → going) unless the
  // caller passes an explicit new list; they only count while "going".
  const keptGuests = guests ?? existing?.guests;
  rsvps.push({
    uid,
    status,
    updatedAt: new Date().toISOString(),
    ...(keptGuests && keptGuests.length > 0 ? { guests: keptGuests } : {}),
  });
  await updateDoc(ref, { rsvps });
}

/**
 * Add ONE guest paddler to a member's RSVP, appended to whatever guests the
 * server already has for them. Read-modify-write against the live doc so a
 * stale client-side guest list can never overwrite (drop) a guest added a
 * moment earlier — the bug that made it look like only one guest per person
 * could be brought. Bringing a guest implies you're going, so the RSVP is set
 * to "going".
 */
export async function addEventGuest(
  clubId: string,
  eventId: string,
  uid: string,
  name: string,
): Promise<void> {
  const ref = doc(db, "clubs", clubId, "events", eventId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const event = snap.data() as Omit<ClubEvent, "id">;
  const existing = event.rsvps.find((r) => r.uid === uid);
  const guests = [...(existing?.guests ?? []), name];
  const rsvps = event.rsvps.filter((r) => r.uid !== uid);
  rsvps.push({
    uid,
    status: "going",
    updatedAt: new Date().toISOString(),
    guests,
  });
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
    tags?: string[];
    taggedUids?: string[];
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
    // Omitted when empty rather than stored as []: Firestore has no way to
    // distinguish the two on read, and absent keeps the documents smaller.
    ...(opts.tags?.length ? { tags: opts.tags } : {}),
    ...(opts.taggedUids?.length ? { taggedUids: opts.taggedUids } : {}),
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

/**
 * Delete a post and any photos attached to it.
 *
 * Goes through a Cloud Function rather than deleting the doc here: a gallery
 * post's photos live under clubs/{clubId}/posts/{postId}/ and would be orphaned
 * in Storage forever by a client-side delete. The function re-checks
 * author-or-owner/admin server-side to match the Firestore rule.
 */
export async function deletePost(clubId: string, postId: string): Promise<void> {
  const fn = httpsCallable<{ clubId: string; postId: string }, { success: boolean }>(
    functions,
    "deleteClubPost",
  );
  await fn({ clubId, postId });
}

/**
 * Edit the body of a text post. Author/admin only — enforced by Firestore
 * rules, the same way toggleLike writes to the post doc directly. Bumps
 * updatedAt so the feed can show an "edited" marker. Polls and photo posts are
 * edited through their own flows, so this is for "post"/"announcement" content.
 */
export async function updatePost(clubId: string, postId: string, content: string): Promise<void> {
  await updateDoc(doc(db, "clubs", clubId, "posts", postId), {
    content,
    updatedAt: new Date().toISOString(),
  });
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
  opts: {
    mediaType?: "photo" | "video";
    replyTo?: ClubMessage["replyTo"];
    /** Uids @-mentioned in `content` — see ClubMessage.mentions. */
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
    // Never mention yourself into your own notification.
    ...(mentions?.length ? { mentions: mentions.filter((m) => m !== uid) } : {}),
    createdAt: now,
    ...(mediaType ? { mediaType } : {}),
  };
  const ref = await addDoc(
    collection(db, "clubs", clubId, "channels", channelId, "messages"),
    msg,
  );
  // lastMessageAt is written by the onChannelMessageCreate trigger, which is
  // authoritative — doing it here too was a second billed write on every
  // message for a value the server was about to set anyway.
  return { ...msg, id: ref.id };
}

/**
 * Toggle an emoji reaction on a message. Uses FieldPath (not dot notation)
 * because emoji aren't valid unquoted field-path segments. Rules restrict
 * member updates to the reactions field only.
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
 * Delete a channel message and its attachments.
 *
 * Goes through a Cloud Function rather than deleting the doc here. The old
 * client-side path removed only the single object named by mediaStoragePath,
 * which multi-image messages never have — uploadChannelMedia records a path
 * for the "media" key alone, so every "media-N" image was orphaned in Storage
 * permanently. The function deletes the whole message prefix, and re-checks
 * author-or-owner/admin server-side to match the Firestore delete rule.
 */
export async function deleteChannelMessage(
  clubId: string,
  channelId: string,
  message: Pick<ClubMessage, "id">,
): Promise<void> {
  const fn = httpsCallable<
    { clubId: string; channelId: string; messageId: string },
    { success: boolean }
  >(functions, "deleteChannelMessage");
  await fn({ clubId, channelId, messageId: message.id });
}

/**
 * How many messages a retention setting would sweep on its next run.
 *
 * An upper bound, not an exact figure: Firestore can't filter on a field being
 * absent, so pinned messages can't be excluded from the count even though the
 * sweep skips them. Surface it as "up to N" rather than a promise.
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
 * Pin or unpin a message. Owner/admin only, enforced by the Firestore rule.
 * Pinned messages are exempt from the club's chat retention sweep.
 */
export async function setMessagePinned(
  clubId: string,
  channelId: string,
  messageId: string,
  pinned: boolean,
  uid: string,
): Promise<void> {
  const ref = doc(db, "clubs", clubId, "channels", channelId, "messages", messageId);
  await updateDoc(
    ref,
    pinned
      ? { pinnedAt: new Date().toISOString(), pinnedBy: uid }
      : { pinnedAt: deleteField(), pinnedBy: deleteField() },
  );
}

/**
 * Edit a message's text (author only, enforced by the Firestore rule). Stamps
 * editedAt so the bubble can show an "edited" marker, and re-writes the
 * resolved @-mentions since the text changed.
 */
export async function updateChannelMessage(
  clubId: string,
  channelId: string,
  messageId: string,
  content: string,
  mentions: string[],
): Promise<void> {
  const ref = doc(db, "clubs", clubId, "channels", channelId, "messages", messageId);
  await updateDoc(ref, {
    content,
    editedAt: new Date().toISOString(),
    mentions: mentions.length ? mentions : deleteField(),
  });
}

export async function uploadMessageMedia(
  clubId: string,
  channelId: string,
  messageId: string,
  localUri: string,
  mimeType: string,
  /** "media" (default, single → mediaUrl) or "media-N" (multi → mediaUrls[]). */
  fileKey: string = "media",
): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("not signed in");

  // Guard against pathologically large uploads (a full-length 4K clip). The
  // signed-URL path below has no hard ceiling, but streaming hundreds of MB
  // over cellular is a bad idea — surface a clear message instead.
  const info = await FileSystem.getInfoAsync(localUri);
  if (info.exists && info.size > 100 * 1024 * 1024) {
    throw new Error("That file is too large to share (max 100 MB).");
  }

  // Direct-to-Storage upload via a short-lived signed URL. This replaces the
  // old base64-in-a-callable path, which capped uploads at ~7 MB (base64
  // inflates the payload past the callable limit) — so videos, which never
  // fit, always failed. Streaming the file straight to the bucket has no such
  // ceiling.
  //
  // 1. Ask the server (which checks club membership) for a signed PUT URL.
  const create = httpsCallable<
    { clubId: string; channelId: string; messageId: string; contentType: string; fileKey?: string },
    { uploadUrl: string }
  >(functions, "createChannelUploadUrl");
  const { data: created } = await create({ clubId, channelId, messageId, contentType: mimeType, fileKey });

  // 2. Stream the file itself to Storage — no base64, no in-memory copy.
  const res = await FileSystem.uploadAsync(created.uploadUrl, localUri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Upload failed (HTTP ${res.status})`);
  }

  // 3. Finalize: the server confirms the object, stamps its download token, and
  //    records the URL on the message. Returns the URL the app should show.
  const finalize = httpsCallable<
    { clubId: string; channelId: string; messageId: string; contentType: string; fileKey?: string },
    { mediaUrl: string }
  >(functions, "finalizeChannelMedia");
  const { data: finalized } = await finalize({ clubId, channelId, messageId, contentType: mimeType, fileKey });
  return finalized.mediaUrl;
}

// ── Channel preferences & FCM ─────────────────────────────────────────────────

export async function registerFcmToken(
  uid: string,
  token: string,
  platform: "ios" | "android",
): Promise<void> {
  const entry: FcmToken = { token, platform, updatedAt: new Date().toISOString() };
  await setDoc(doc(db, "users", uid, "fcmTokens", token), entry);

  // Mirror the token onto the user document as well.
  //
  // The push fan-out reads every recipient's user doc already; without this it
  // also had to read this whole subcollection per recipient per message, which
  // was a billed read for each one. Writing the token in both places lets that
  // read disappear while the subcollection stays authoritative for anything
  // that still needs per-device metadata.
  await setDoc(
    doc(db, "users", uid),
    { expoTokens: arrayUnion(token) },
    { merge: true },
  );
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

/**
 * Live per-channel unread counts for one user, keyed by channel id.
 *
 * The app-icon badge uses the single `unreadTotal` on the user doc, but that
 * is global across every club someone belongs to — fine for a badge, wrong for
 * a per-club indicator. Callers sum only the channels they care about.
 *
 * Only channels with something unread come back; callers already default a
 * missing channel to zero. The filter is server-side because a listener bills
 * a read per delivered document — including the full initial payload on every
 * re-subscribe — and a preference doc exists for every channel a user has ever
 * opened, most of them sitting at zero.
 */
export function subscribeChannelUnread(
  uid: string,
  onUpdate: (unreadByChannel: Record<string, number>) => void,
): () => void {
  const q = query(
    collection(db, "users", uid, "channelPreferences"),
    where("unreadCount", ">", 0),
    limit(200),
  );
  return onSnapshot(q, (snap) => {
    const counts: Record<string, number> = {};
    for (const d of snap.docs) {
      counts[d.id] = Math.max(0, (d.data() as ChannelPreference).unreadCount ?? 0);
    }
    onUpdate(counts);
  });
}

/** Current global unread total for the app-icon badge (0 if unset). */
export async function getUnreadTotal(uid: string): Promise<number> {
  const snap = await getDoc(doc(db, "users", uid));
  return Math.max(0, (snap.data()?.unreadTotal as number | undefined) ?? 0);
}

// ── Club gallery ─────────────────────────────────────────────────────────────
//
// Photo posts share the posts collection, so likes, comments and moderation
// come for free — see the PostType comment in models/club.ts.

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

/**
 * Attach one photo to a post.
 *
 * Server-side for the same Blob reason uploadMessageMedia is: React Native
 * can't build what the Storage SDK wants. "media" for a single photo, "media-N"
 * for each of several.
 */
export async function uploadPostMedia(
  clubId: string,
  postId: string,
  localUri: string,
  mimeType: string,
  fileKey: string = "media",
): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const fn = httpsCallable<
    { clubId: string; postId: string; base64: string; contentType: string; fileKey?: string },
    { mediaUrl: string }
  >(functions, "uploadPostMedia");
  const { data } = await fn({ clubId, postId, base64, contentType: mimeType, fileKey });
  return data.mediaUrl;
}
