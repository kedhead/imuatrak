/**
 * Sign-up sheets (potlucks, gear, volunteers) on the web.
 *
 * Types and helpers are mirrored from src/models/club.ts and the writes from
 * src/services/clubService.ts — both clients have to produce exactly the
 * shapes firestore.rules accepts (signupItems block), so keep them in step.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  FieldPath,
  getDocs,
  onSnapshot,
  runTransaction,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

export interface SignupClaim {
  name: string;
  note?: string;
  claimedAt: string;
}

export interface SignupItem {
  id: string;
  label: string;
  details?: string;
  slots: number;
  order: number;
  createdBy: string;
  createdAt: string;
  writeIn?: boolean;
  claims: Record<string, SignupClaim>;
}

export const SIGNUP_LABEL_MAX = 60;
export const SIGNUP_DETAILS_MAX = 120;
export const SIGNUP_NOTE_MAX = 80;
export const SIGNUP_SLOTS_MAX = 50;
export const SIGNUP_ITEMS_MAX = 40;

export interface SignupTemplate {
  id: string;
  emoji: string;
  name: string;
  items: { label: string; slots: number; details?: string }[];
}

export const SIGNUP_TEMPLATES: SignupTemplate[] = [
  {
    id: "potluck",
    emoji: "🥘",
    name: "Potluck",
    items: [
      { label: "Main dish", slots: 4, details: "Serves 8–10" },
      { label: "Side dish / salad", slots: 4 },
      { label: "Pūpū / appetizers", slots: 3 },
      { label: "Dessert", slots: 3 },
      { label: "Drinks + ice", slots: 2 },
      { label: "Plates, cups & utensils", slots: 1 },
    ],
  },
  {
    id: "gear",
    emoji: "🛶",
    name: "Race-day gear",
    items: [
      { label: "Pop-up tent", slots: 2 },
      { label: "Canoe trailer / tow", slots: 1 },
      { label: "Spare paddles", slots: 2 },
      { label: "Bailers", slots: 2 },
      { label: "Lashing ropes & bungees", slots: 1 },
      { label: "First-aid kit", slots: 1 },
      { label: "Cooler with ice", slots: 2 },
      { label: "Tables & chairs", slots: 2 },
    ],
  },
  {
    id: "volunteers",
    emoji: "🙋",
    name: "Volunteers",
    items: [
      { label: "Rig canoes", slots: 4, details: "Arrive an hour early" },
      { label: "Escort boat crew", slots: 2 },
      { label: "Tent setup", slots: 3 },
      { label: "Check-in / registration", slots: 2 },
      { label: "Photographer", slots: 1 },
      { label: "De-rig & cleanup", slots: 4 },
    ],
  },
  {
    id: "snacks",
    emoji: "🍉",
    name: "Practice snacks",
    items: [
      { label: "Water jug", slots: 1 },
      { label: "Fruit", slots: 2 },
      { label: "Snacks", slots: 2 },
      { label: "Electrolyte drinks", slots: 1 },
    ],
  },
];

export const claimCount = (item: SignupItem) => Object.keys(item.claims ?? {}).length;
export const openSlots = (item: SignupItem) => Math.max(0, item.slots - claimCount(item));

export function signupProgress(items: SignupItem[]): { filled: number; total: number } {
  let filled = 0;
  let total = 0;
  for (const item of items) {
    filled += Math.min(claimCount(item), item.slots);
    total += item.slots;
  }
  return { filled, total };
}

export function sortSignupItems(items: SignupItem[]): SignupItem[] {
  return [...items].sort(
    (a, b) =>
      Number(!!a.writeIn) - Number(!!b.writeIn) ||
      a.order - b.order ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

export function sortedClaims(item: SignupItem): (SignupClaim & { uid: string })[] {
  return Object.entries(item.claims ?? {})
    .map(([uid, c]) => ({ ...c, uid }))
    .sort((a, b) => a.claimedAt.localeCompare(b.claimedAt));
}

export function clampSlots(n: number, minimum = 1): number {
  if (!Number.isFinite(n)) return Math.max(1, minimum);
  return Math.min(SIGNUP_SLOTS_MAX, Math.max(1, minimum, Math.floor(n)));
}

// ── Firestore ───────────────────────────────────────────────────────────────

const itemsCol = (clubId: string, eventId: string) =>
  collection(db, "clubs", clubId, "events", eventId, "signupItems");

export function subscribeSignupItems(
  clubId: string,
  eventId: string,
  onItems: (items: SignupItem[]) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    itemsCol(clubId, eventId),
    (snap) =>
      onItems(
        snap.docs.map((d) => {
          const data = d.data() as Omit<SignupItem, "id">;
          return { ...data, claims: data.claims ?? {}, id: d.id };
        }),
      ),
    (e) => onError?.(e),
  );
}

/** Staff: add items in one batch (a template lands all at once). */
export async function addSignupItems(
  clubId: string,
  eventId: string,
  uid: string,
  items: { label: string; slots: number; details?: string }[],
  startOrder: number,
): Promise<void> {
  const batch = writeBatch(db);
  const now = new Date().toISOString();
  items.forEach((it, i) => {
    const details = it.details?.trim();
    batch.set(doc(itemsCol(clubId, eventId)), {
      label: it.label.trim(),
      slots: it.slots,
      order: startOrder + i,
      createdBy: uid,
      createdAt: now,
      claims: {},
      ...(details ? { details } : {}),
    });
  });
  await batch.commit();
}

export async function updateSignupItem(
  clubId: string,
  eventId: string,
  itemId: string,
  updates: { label: string; slots: number; details?: string },
): Promise<void> {
  const details = updates.details?.trim();
  await updateDoc(doc(itemsCol(clubId, eventId), itemId), {
    label: updates.label.trim(),
    slots: updates.slots,
    details: details ? details : deleteField(),
  });
}

export async function deleteSignupItem(clubId: string, eventId: string, itemId: string): Promise<void> {
  await deleteDoc(doc(itemsCol(clubId, eventId), itemId));
}

export async function clearSignupSheet(clubId: string, eventId: string): Promise<number> {
  const items = await getDocs(itemsCol(clubId, eventId));
  if (items.empty) return 0;
  const batch = writeBatch(db);
  items.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return items.size;
}

/** Claim a slot (or update your note). Transactional so the last slot can't be double-taken. */
export async function claimSignupSlot(
  clubId: string,
  eventId: string,
  itemId: string,
  uid: string,
  name: string,
  note?: string,
): Promise<void> {
  const ref = doc(itemsCol(clubId, eventId), itemId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("That item was removed.");
    const item = snap.data() as Omit<SignupItem, "id">;
    const claims = item.claims ?? {};
    const existing = claims[uid];
    if (!existing && Object.keys(claims).length >= item.slots) throw new Error("That item just filled up.");
    const trimmed = note?.trim();
    const claim: SignupClaim = {
      name,
      claimedAt: existing?.claimedAt ?? new Date().toISOString(),
      ...(trimmed ? { note: trimmed } : {}),
    };
    tx.update(ref, new FieldPath("claims", uid), claim);
  });
}

export async function releaseSignupSlot(
  clubId: string,
  eventId: string,
  itemId: string,
  uid: string,
): Promise<void> {
  await updateDoc(doc(itemsCol(clubId, eventId), itemId), new FieldPath("claims", uid), deleteField());
}

/** Member "Bring something else": a one-slot item they hold themselves. */
export async function addWriteInItem(
  clubId: string,
  eventId: string,
  uid: string,
  name: string,
  label: string,
  note?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const trimmed = note?.trim();
  await addDoc(itemsCol(clubId, eventId), {
    label: label.trim(),
    slots: 1,
    order: 0,
    createdBy: uid,
    createdAt: now,
    writeIn: true,
    claims: { [uid]: { name, claimedAt: now, ...(trimmed ? { note: trimmed } : {}) } },
  });
}
