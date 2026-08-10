import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  FieldPath,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import type { DmMessage, DmThread } from "@/models/club";

/**
 * Direct messages.
 *
 * Threads live at the top level rather than inside a club — see the DmThread
 * comment in models/club.ts for why a two-person private channel was the wrong
 * shape. Everything here is participant-only; there is no moderator path.
 */

/** Threads the user is in, most recent first. */
export function subscribeDmThreads(
  uid: string,
  onUpdate: (threads: (DmThread & { id: string })[]) => void,
): () => void {
  const q = query(
    collection(db, "dms"),
    where("participants", "array-contains", uid),
    limit(100),
  );
  return onSnapshot(q, (snap) => {
    const threads = snap.docs.map((d) => ({ ...(d.data() as DmThread), id: d.id }));
    // Sorted client-side: ordering on lastMessageAt would need a composite
    // index, and a brand-new thread has no lastMessageAt at all, so it would
    // drop out of the list until someone spoke.
    threads.sort((a, b) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt));
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
  // Newest-first then reversed, same as club chat: an ascending limit would
  // pin the listener to the oldest messages and never surface new ones.
  return onSnapshot(q, (snap) => {
    const msgs = snap.docs.map((d) => ({ ...(d.data() as Omit<DmMessage, "id">), id: d.id }));
    onUpdate(msgs.reverse());
  });
}

/**
 * Find or create the thread with another user. Server-side because the pairing
 * has to be checked — you may only DM someone you share a club with.
 */
export async function openDmThread(otherUid: string): Promise<string> {
  const fn = httpsCallable<{ otherUid: string }, { threadId: string }>(functions, "openDmThread");
  const { data } = await fn({ otherUid });
  return data.threadId;
}

export async function sendDmMessage(
  threadId: string,
  uid: string,
  displayName: string,
  content: string,
  replyTo?: DmMessage["replyTo"],
): Promise<DmMessage> {
  const now = new Date().toISOString();
  const msg: Omit<DmMessage, "id"> = {
    threadId,
    content,
    authorId: uid,
    authorName: displayName,
    ...(replyTo ? { replyTo } : {}),
    createdAt: now,
  };
  const ref = await addDoc(collection(db, "dms", threadId, "messages"), msg);
  // Keeps the thread list ordered and previewable without reading messages.
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

/** Live per-thread unread counts, keyed by threadId. */
export function subscribeDmUnread(
  uid: string,
  onUpdate: (byThread: Record<string, number>) => void,
): () => void {
  return onSnapshot(collection(db, "users", uid, "dmThreads"), (snap) => {
    const map: Record<string, number> = {};
    for (const d of snap.docs) {
      const count = (d.data() as { unreadCount?: number }).unreadCount ?? 0;
      if (count > 0) map[d.id] = count;
    }
    onUpdate(map);
  });
}

/**
 * Clear a thread's unread count and decrement the global total.
 *
 * Same transaction shape as markChannelRead: subtract this thread's count from
 * unreadTotal rather than recomputing, so the app-icon badge stays consistent
 * with club chat, which shares that counter.
 */
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
