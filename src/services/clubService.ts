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
  orderBy,
  limit,
  arrayUnion,
  increment,
  Timestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import type {
  BoatAssignment,
  Club,
  ClubMember,
  ClubEvent,
  ClubPost,
  ClubComment,
  MemberRole,
  EventType,
  PostType,
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
    memberCount: 1,
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
  updates: Partial<Pick<Club, "name" | "description" | "location" | "logoUrl">>,
): Promise<void> {
  await updateDoc(doc(db, "clubs", clubId), updates);
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
  const member: ClubMember = {
    uid,
    role: "member",
    displayName,
    joinedAt: new Date().toISOString(),
    invitedBy,
  };
  await setDoc(doc(db, "clubs", clubId, "members", uid), member);
  await updateDoc(doc(db, "clubs", clubId), { memberCount: increment(1) });
  await addClubToIndex(uid, clubId);
}

export async function leaveClub(clubId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db, "clubs", clubId, "members", uid));
  await updateDoc(doc(db, "clubs", clubId), { memberCount: increment(-1) });
  await removeClubFromIndex(uid, clubId);
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
  await updateDoc(doc(db, "clubs", clubId), { memberCount: increment(-1) });
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
      orderBy("startAt"),
      limit(maxItems),
    ),
  );
  return snap.docs
    .map((d) => ({ ...(d.data() as Omit<ClubEvent, "id">), id: d.id }))
    .filter((e) => e.endAt >= now);
}

export async function getPastEvents(clubId: string, maxItems = 20): Promise<ClubEvent[]> {
  const now = new Date().toISOString();
  const snap = await getDocs(
    query(
      collection(db, "clubs", clubId, "events"),
      orderBy("startAt", "desc"),
      limit(maxItems),
    ),
  );
  return snap.docs
    .map((d) => ({ ...(d.data() as Omit<ClubEvent, "id">), id: d.id }))
    .filter((e) => e.endAt < now);
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
    description: opts.description,
    type: opts.type,
    startAt: opts.startAt,
    endAt: opts.endAt,
    location: opts.location,
    meetTime: opts.meetTime,
    meetLocation: opts.meetLocation,
    maxParticipants: opts.maxParticipants,
    boatAssignments: opts.boatAssignments,
    createdBy: uid,
    rsvps: [],
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
  },
): Promise<ClubPost> {
  const now = new Date().toISOString();
  const post: Omit<ClubPost, "id"> = {
    clubId,
    type: opts.type,
    content: opts.content,
    authorId: uid,
    authorName: displayName,
    pinnedUntil: opts.pinnedUntil,
    linkedSessionId: opts.linkedSessionId,
    likeCount: 0,
    commentCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  const ref = await addDoc(collection(db, "clubs", clubId, "posts"), post);
  return { ...post, id: ref.id };
}

export async function deletePost(clubId: string, postId: string): Promise<void> {
  await deleteDoc(doc(db, "clubs", clubId, "posts", postId));
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
