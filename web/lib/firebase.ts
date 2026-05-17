import { getApp, getApps, initializeApp } from "firebase/app";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  increment,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import type { DashboardSession, PublicSession } from "./types";
import type { Club, ClubMember, ClubEvent, ClubPost, MemberRole, EventType, PostType } from "./clubTypes";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(config);
export const db = getFirestore(firebaseApp);

/** Read a public session (no auth required). */
export async function getPublicSession(id: string): Promise<PublicSession | null> {
  const snap = await getDoc(doc(db, "publicSessions", id));
  if (!snap.exists()) return null;
  return snap.data() as PublicSession;
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

export async function getClubEvents(clubId: string): Promise<ClubEvent[]> {
  const snap = await getDocs(
    query(collection(db, "clubs", clubId, "events"), orderBy("startAt"), limit(50)),
  );
  return snap.docs.map((d) => ({ ...(d.data() as Omit<ClubEvent, "id">), id: d.id }));
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
  updates: Partial<Pick<Club, "name" | "description" | "location">>,
): Promise<void> {
  const ref = doc(db, "clubs", clubId);
  if (updates.name !== undefined) await updateDoc(ref, { name: updates.name });
  if (updates.description !== undefined) await updateDoc(ref, { description: updates.description });
  if (updates.location !== undefined) await updateDoc(ref, { location: updates.location });
}
