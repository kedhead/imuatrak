/**
 * Club payments: Firestore reads/writes for pay methods, items and orders.
 * Shapes must satisfy firestore.rules (payMethods / payItems / payOrders) —
 * see src/models/payments.ts.
 */
import * as FileSystem from "expo-file-system/legacy";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import type {
  PayItem,
  PayItemKind,
  PayMethod,
  PayMethodKind,
  PayOrder,
  PayOrderStatus,
} from "@/models/payments";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import { prepareImageForUpload } from "./imageResize";

const methodsCol = (clubId: string) => collection(db, "clubs", clubId, "payMethods");
const itemsCol = (clubId: string) => collection(db, "clubs", clubId, "payItems");
const ordersCol = (clubId: string) => collection(db, "clubs", clubId, "payOrders");

const nowIso = () => new Date().toISOString();

/** Copy only defined, non-empty optional strings (rules reject nulls). */
function optional(fields: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    const t = v?.trim();
    if (t) out[k] = t;
  }
  return out;
}

// ── Subscriptions ────────────────────────────────────────────────────────────

export function subscribePayMethods(
  clubId: string,
  onData: (m: PayMethod[]) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    methodsCol(clubId),
    (snap) => onData(snap.docs.map((d) => ({ ...(d.data() as Omit<PayMethod, "id">), id: d.id }))),
    (e) => onError?.(e),
  );
}

export function subscribePayItems(
  clubId: string,
  onData: (items: PayItem[]) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    itemsCol(clubId),
    (snap) => onData(snap.docs.map((d) => ({ ...(d.data() as Omit<PayItem, "id">), id: d.id }))),
    (e) => onError?.(e),
  );
}

/** Everyone's orders (treasurers) or just mine (members — the rules only
 *  allow a member's query when it filters on their own uid). */
export function subscribePayOrders(
  clubId: string,
  scope: { all: true } | { uid: string },
  onData: (orders: PayOrder[]) => void,
  onError?: (e: Error) => void,
): () => void {
  const q = "all" in scope ? ordersCol(clubId) : query(ordersCol(clubId), where("uid", "==", scope.uid));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ ...(d.data() as Omit<PayOrder, "id">), id: d.id }))),
    (e) => onError?.(e),
  );
}

// ── Methods ──────────────────────────────────────────────────────────────────

export interface PayMethodDraft {
  kind: PayMethodKind;
  handle?: string;
  url?: string;
  qrUrl?: string;
  instructions?: string;
  label?: string;
}

export async function addPayMethod(clubId: string, draft: PayMethodDraft, order: number): Promise<void> {
  await addDoc(methodsCol(clubId), {
    kind: draft.kind,
    ...optional({
      handle: draft.handle,
      url: draft.url,
      qrUrl: draft.qrUrl,
      instructions: draft.instructions,
      label: draft.label,
    }),
    order,
    createdAt: nowIso(),
  });
}

export async function updatePayMethod(clubId: string, id: string, draft: PayMethodDraft): Promise<void> {
  const set = (v: string | undefined) => (v?.trim() ? v.trim() : deleteField());
  await updateDoc(doc(methodsCol(clubId), id), {
    kind: draft.kind,
    handle: set(draft.handle),
    url: set(draft.url),
    qrUrl: set(draft.qrUrl),
    instructions: set(draft.instructions),
    label: set(draft.label),
  });
}

export async function deletePayMethod(clubId: string, id: string): Promise<void> {
  await deleteDoc(doc(methodsCol(clubId), id));
}

/**
 * Upload a payment QR code image and return its download URL. Goes through
 * the uploadPayQr Cloud Function, which checks the caller can manage
 * payments (a direct Storage upload was refused in production).
 */
export async function uploadPayQr(clubId: string, pickedUri: string, pickedType: string): Promise<string> {
  // QR codes need to stay sharp to scan, but never need to be huge.
  const { uri, mimeType } = await prepareImageForUpload(pickedUri, pickedType, 1200);
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const fn = httpsCallable<{ clubId: string; base64: string; contentType: string }, { url: string }>(
    functions,
    "uploadPayQr",
  );
  const { data } = await fn({ clubId, base64, contentType: mimeType });
  return data.url;
}

// ── Items ────────────────────────────────────────────────────────────────────

export interface PayItemDraft {
  title: string;
  description?: string;
  kind: PayItemKind;
  priceCents: number;
  options: string[];
  /** Absent: unlimited. */
  stock?: Record<string, number>;
  active: boolean;
}

export async function addPayItem(clubId: string, uid: string, draft: PayItemDraft, order: number): Promise<void> {
  await addDoc(itemsCol(clubId), {
    title: draft.title.trim(),
    ...optional({ description: draft.description }),
    kind: draft.kind,
    priceCents: draft.priceCents,
    ...(draft.options.length ? { options: draft.options } : {}),
    ...(draft.stock ? { stock: draft.stock } : {}),
    active: draft.active,
    order,
    createdBy: uid,
    createdAt: nowIso(),
  });
}

export async function updatePayItem(clubId: string, id: string, draft: PayItemDraft): Promise<void> {
  await updateDoc(doc(itemsCol(clubId), id), {
    title: draft.title.trim(),
    description: draft.description?.trim() ? draft.description.trim() : deleteField(),
    kind: draft.kind,
    priceCents: draft.priceCents,
    options: draft.options.length ? draft.options : deleteField(),
    stock: draft.stock ? draft.stock : deleteField(),
    active: draft.active,
  });
}

export async function setPayItemActive(clubId: string, id: string, active: boolean): Promise<void> {
  await updateDoc(doc(itemsCol(clubId), id), { active });
}

export async function deletePayItem(clubId: string, id: string): Promise<void> {
  await deleteDoc(doc(itemsCol(clubId), id));
}

// ── Orders ───────────────────────────────────────────────────────────────────

export interface NewOrder {
  uid: string;
  name: string;
  item: Pick<PayItem, "id" | "title" | "kind" | "priceCents">;
  option?: string;
  qty: number;
  method: string;
  note?: string;
  /** Treasurer entering it for someone: confirmed straight away. */
  recordedBy?: string;
  status?: PayOrderStatus;
}

export async function createPayOrder(clubId: string, o: NewOrder): Promise<void> {
  const now = nowIso();
  const status: PayOrderStatus = o.status ?? "pending";
  await addDoc(ordersCol(clubId), {
    uid: o.uid,
    name: o.name.slice(0, 100),
    itemId: o.item.id,
    itemTitle: o.item.title,
    itemKind: o.item.kind,
    ...(o.option ? { option: o.option } : {}),
    qty: o.qty,
    unitCents: o.item.priceCents,
    totalCents: o.item.priceCents * o.qty,
    method: o.method,
    status,
    ...optional({ note: o.note?.slice(0, 120) }),
    ...(o.recordedBy ? { recordedBy: o.recordedBy } : {}),
    ...(o.recordedBy && status === "confirmed" ? { confirmedAt: now, confirmedBy: o.recordedBy } : {}),
    createdAt: now,
    updatedAt: now,
  });
}

/** Treasurer: confirm, un-confirm or cancel. */
export async function setPayOrderStatus(
  clubId: string,
  id: string,
  status: PayOrderStatus,
  byUid: string,
): Promise<void> {
  const now = nowIso();
  await updateDoc(doc(ordersCol(clubId), id), {
    status,
    updatedAt: now,
    ...(status === "confirmed"
      ? { confirmedAt: now, confirmedBy: byUid }
      : { confirmedAt: deleteField(), confirmedBy: deleteField() }),
  });
}

/** Member: withdraw your own pending "I paid". */
export async function cancelMyPayOrder(clubId: string, id: string): Promise<void> {
  await updateDoc(doc(ordersCol(clubId), id), { status: "cancelled", updatedAt: nowIso() });
}

export async function deletePayOrder(clubId: string, id: string): Promise<void> {
  await deleteDoc(doc(ordersCol(clubId), id));
}

/** Owner/admin: grant or remove the treasurer flag. */
export async function setTreasurer(clubId: string, uid: string, treasurer: boolean): Promise<void> {
  await updateDoc(doc(db, "clubs", clubId, "members", uid), {
    treasurer: treasurer ? true : deleteField(),
  });
}
