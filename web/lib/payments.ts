/**
 * Club payments on the web: how a club takes dues and sells merch.
 *
 * The pure half (types, money, links, stock, dues status) is mirrored from
 * src/models/payments.ts and the writes from src/services/paymentService.ts.
 * Both clients must produce exactly the shapes firestore.rules accepts
 * (payMethods / payItems / payOrders), so keep them in step.
 *
 * ImuaTrak never touches the money. A club lists the ways it accepts payment
 * (Zelle, Venmo, PayPal, Cash App, a store link, or plain instructions) and
 * the things members pay for. A member picks an item, pays through their own
 * app with the amount and memo filled in where that app allows it, then taps
 * "I paid". The treasurer confirms it once the money shows up.
 */
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
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type { Club, ClubMember, MemberRole } from "./clubTypes";
import { db, storage } from "./firebase";

export type PayMethodKind = "zelle" | "venmo" | "paypal" | "cashapp" | "link" | "other";

export interface PayMethod {
  id: string;
  kind: PayMethodKind;
  /** Zelle email/phone, Venmo username, PayPal.me name, Cash App $tag. */
  handle?: string;
  /** "link" only: a store or checkout page. */
  url?: string;
  /** Uploaded QR code image (typically Zelle's, from the bank app). */
  qrUrl?: string;
  /** Free text: who to pay, what to write, where to hand cash. */
  instructions?: string;
  /** Overrides the default name ("Zelle", "Venmo"...). */
  label?: string;
  order: number;
  createdAt: string;
}

export type PayItemKind = "dues" | "merch" | "other";

/** Stock/sold key for an item without options (sizes). */
export const NO_OPTION = "_";

export interface PayItem {
  id: string;
  title: string;
  description?: string;
  kind: PayItemKind;
  /** Price in cents. 0 is allowed ("pay what you can" / free sign-up). */
  priceCents: number;
  /** Sizes or variants, e.g. ["S","M","L"]. Absent: one kind only. */
  options?: string[];
  /** Units in stock per option (NO_OPTION when there are no options).
   *  Absent: unlimited. */
  stock?: Record<string, number>;
  /** Units claimed per option by pending + confirmed orders. Maintained by
   *  the onPayOrderWrite Cloud Function; clients never write it. */
  sold?: Record<string, number>;
  /** Hidden from members when false (kept for the order history). */
  active: boolean;
  order: number;
  createdBy: string;
  createdAt: string;
}

export type PayOrderStatus = "pending" | "confirmed" | "cancelled";

export interface PayOrder {
  id: string;
  uid: string;
  /** Member's name at the time, for the treasurer list. */
  name: string;
  itemId: string;
  itemTitle: string;
  itemKind: PayItemKind;
  option?: string;
  qty: number;
  unitCents: number;
  totalCents: number;
  /** How they said they paid (a PayMethodKind, or "cash"). */
  method: string;
  status: PayOrderStatus;
  /** Member's own note ("paid from my husband's account"). */
  note?: string;
  /** Set when a treasurer entered it for someone (cash at practice). */
  recordedBy?: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
  confirmedBy?: string;
}

export const PAY_TITLE_MAX = 60;
export const PAY_DESC_MAX = 300;
export const PAY_HANDLE_MAX = 100;
export const PAY_INSTRUCTIONS_MAX = 300;
export const PAY_NOTE_MAX = 120;
export const PAY_OPTIONS_MAX = 12;
export const PAY_OPTION_MAX = 20;
export const PAY_QTY_MAX = 20;
export const PAY_PRICE_MAX_CENTS = 1_000_000; // $10,000
export const PAY_STOCK_MAX = 10_000;

export const PAY_METHOD_INFO: Record<
  PayMethodKind,
  { name: string; emoji: string; handleLabel?: string; handlePlaceholder?: string }
> = {
  zelle: { name: "Zelle", emoji: "🏦", handleLabel: "Zelle email or phone", handlePlaceholder: "treasurer@myclub.org" },
  venmo: { name: "Venmo", emoji: "💙", handleLabel: "Venmo username", handlePlaceholder: "MyClub-Treasurer" },
  paypal: { name: "PayPal", emoji: "🅿️", handleLabel: "PayPal.me name", handlePlaceholder: "myclub" },
  cashapp: { name: "Cash App", emoji: "💵", handleLabel: "Cash App $tag", handlePlaceholder: "$myclub" },
  link: { name: "Online store", emoji: "🛒" },
  other: { name: "Other", emoji: "📝" },
};

export const PAY_ITEM_KIND_INFO: Record<PayItemKind, { name: string; emoji: string }> = {
  dues: { name: "Dues", emoji: "🪪" },
  merch: { name: "Merch", emoji: "👕" },
  other: { name: "Other", emoji: "🧾" },
};

export const ORDER_METHOD_CASH = "cash";

export function payMethodName(m: Pick<PayMethod, "kind" | "label">): string {
  return m.label?.trim() || PAY_METHOD_INFO[m.kind]?.name || "Payment";
}

/** Who can set up payments and see/confirm everyone's: staff, plus anyone
 *  the club has made treasurer. */
export function canManagePayments(
  role: MemberRole | null | undefined,
  me: Pick<ClubMember, "treasurer"> | null | undefined,
): boolean {
  return role === "owner" || role === "admin" || role === "coach" || me?.treasurer === true;
}

// ── Money ────────────────────────────────────────────────────────────────────

/** 2500 → "$25", 2550 → "$25.50". */
export function formatMoney(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.round(cents) : 0;
  const neg = safe < 0;
  const abs = Math.abs(safe);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const whole = dollars.toLocaleString("en-US");
  return `${neg ? "-" : ""}$${whole}${rem ? `.${String(rem).padStart(2, "0")}` : ""}`;
}

/** Amount for a payment app link: "25" or "25.50". */
export function amountParam(cents: number): string {
  const c = Math.max(0, Math.round(cents));
  return c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2);
}

/** "$25", "25.5", "1,000" → cents; null when it isn't a sensible price. */
export function parseMoney(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  if (!Number.isFinite(cents) || cents < 0 || cents > PAY_PRICE_MAX_CENTS) return null;
  return cents;
}

// ── Stock ────────────────────────────────────────────────────────────────────

export function stockKey(option: string | undefined): string {
  return option ? option : NO_OPTION;
}

/** Units left for an option, or null when the item is unlimited. */
export function remainingStock(item: Pick<PayItem, "stock" | "sold">, option?: string): number | null {
  const key = stockKey(option);
  const stock = item.stock?.[key];
  if (typeof stock !== "number") return null;
  return Math.max(0, stock - (item.sold?.[key] ?? 0));
}

/** True when every option (or the single one) is sold out. */
export function isSoldOut(item: Pick<PayItem, "stock" | "sold" | "options">): boolean {
  const keys = item.options?.length ? item.options : [undefined];
  return keys.every((o) => remainingStock(item, o) === 0);
}

// ── Links ────────────────────────────────────────────────────────────────────

/** "$Tag" / "@user" / "paypal.me/x" → bare handle. */
export function cleanHandle(kind: PayMethodKind, handle: string): string {
  let h = handle.trim();
  if (kind === "venmo") h = h.replace(/^@/, "").replace(/^(https?:\/\/)?(www\.)?venmo\.com\/(u\/)?/i, "");
  if (kind === "cashapp") h = h.replace(/^(https?:\/\/)?cash\.app\//i, "").replace(/^\$/, "");
  if (kind === "paypal") h = h.replace(/^(https?:\/\/)?(www\.)?paypal\.(me|com\/paypalme)\//i, "");
  return h.replace(/\/+$/, "");
}

/**
 * A link that opens the payment app with the amount (and, for Venmo, the memo)
 * filled in. https links, not app schemes: they open the app when it's
 * installed and the website otherwise, and need no native config. Zelle and
 * "other" have no such link (null) — the member copies the handle instead.
 */
export function payLink(
  m: Pick<PayMethod, "kind" | "handle" | "url">,
  cents: number,
  memo: string,
): string | null {
  const amount = amountParam(cents);
  const handle = m.handle ? encodeURIComponent(cleanHandle(m.kind, m.handle)) : "";
  switch (m.kind) {
    case "venmo":
      if (!handle) return null;
      return (
        `https://venmo.com/?txn=pay&recipients=${handle}` +
        (cents > 0 ? `&amount=${amount}` : "") +
        `&note=${encodeURIComponent(memo)}`
      );
    case "paypal":
      if (!handle) return null;
      return `https://paypal.me/${handle}${cents > 0 ? `/${amount}` : ""}`;
    case "cashapp":
      if (!handle) return null;
      return `https://cash.app/$${handle}${cents > 0 ? `/${amount}` : ""}`;
    case "link": {
      const url = m.url?.trim();
      if (!url) return null;
      return /^https?:\/\//i.test(url) ? url : `https://${url}`;
    }
    default:
      return null;
  }
}

/** Memo the member pastes so the treasurer can match the payment:
 *  "2027 Dues – Kendall D." / "Club T-shirt (M) x2 – Kendall D." */
export function paymentMemo(itemTitle: string, memberName: string, option?: string, qty = 1): string {
  const parts = memberName.trim().split(/\s+/).filter(Boolean);
  const short =
    parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.` : parts[0] ?? "";
  const what = `${itemTitle.trim()}${option ? ` (${option})` : ""}${qty > 1 ? ` x${qty}` : ""}`;
  return short ? `${what} – ${short}` : what;
}

// ── Lists ────────────────────────────────────────────────────────────────────

export function sortPayItems<T extends Pick<PayItem, "kind" | "order" | "createdAt">>(items: T[]): T[] {
  const rank: Record<PayItemKind, number> = { dues: 0, merch: 1, other: 2 };
  return [...items].sort(
    (a, b) => rank[a.kind] - rank[b.kind] || a.order - b.order || a.createdAt.localeCompare(b.createdAt),
  );
}

export function sortPayMethods<T extends Pick<PayMethod, "order" | "createdAt">>(methods: T[]): T[] {
  return [...methods].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

/** Newest first, pending ahead of everything else. */
export function sortOrders<T extends Pick<PayOrder, "status" | "createdAt">>(orders: T[]): T[] {
  const rank: Record<PayOrderStatus, number> = { pending: 0, confirmed: 1, cancelled: 2 };
  return [...orders].sort((a, b) => rank[a.status] - rank[b.status] || b.createdAt.localeCompare(a.createdAt));
}

export type DuesStatus = "paid" | "pending" | "unpaid";

/**
 * For a dues item: each member's standing. Paid beats pending; cancelled
 * orders don't count.
 */
export function duesStatusByMember(
  itemId: string,
  members: Pick<ClubMember, "uid">[],
  orders: Pick<PayOrder, "uid" | "itemId" | "status">[],
): Map<string, DuesStatus> {
  const out = new Map<string, DuesStatus>();
  for (const m of members) out.set(m.uid, "unpaid");
  for (const o of orders) {
    if (o.itemId !== itemId || o.status === "cancelled" || !out.has(o.uid)) continue;
    if (o.status === "confirmed") out.set(o.uid, "paid");
    else if (out.get(o.uid) !== "paid") out.set(o.uid, "pending");
  }
  return out;
}

/** Totals for the treasurer's header. */
export function orderTotals(orders: Pick<PayOrder, "status" | "totalCents">[]): {
  confirmedCents: number;
  pendingCents: number;
  pendingCount: number;
} {
  let confirmedCents = 0;
  let pendingCents = 0;
  let pendingCount = 0;
  for (const o of orders) {
    if (o.status === "confirmed") confirmedCents += o.totalCents;
    else if (o.status === "pending") {
      pendingCents += o.totalCents;
      pendingCount += 1;
    }
  }
  return { confirmedCents, pendingCents, pendingCount };
}

/** Pro (paid, or a trial that hasn't run out) — mirrors clubIsPro in the app. */
export function clubIsPro(club: Pick<Club, "subscriptionStatus" | "trialEndsAt"> | null | undefined): boolean {
  if (!club) return false;
  if (club.subscriptionStatus === "active") return true;
  return club.subscriptionStatus === "trial" && typeof club.trialEndsAt === "string" && club.trialEndsAt > new Date().toISOString();
}

function csvCell(v: string | number | undefined): string {
  const s = v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function orderMethodLabel(method: string): string {
  if (method === ORDER_METHOD_CASH) return "Cash";
  return PAY_METHOD_INFO[method as PayMethodKind]?.name ?? method;
}

export function ordersToCsv(orders: PayOrder[]): string {
  const rows: (string | number)[][] = [
    ["Date", "Member", "Item", "Option", "Qty", "Total", "Method", "Status", "Note"],
    ...sortOrders(orders).map((o) => [
      o.createdAt.slice(0, 10),
      o.name,
      o.itemTitle,
      o.option ?? "",
      o.qty,
      (o.totalCents / 100).toFixed(2),
      orderMethodLabel(o.method),
      o.status,
      o.note ?? "",
    ]),
  ];
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

// ── Firestore ────────────────────────────────────────────────────────────────

const methodsCol = (clubId: string) => collection(db, "clubs", clubId, "payMethods");
const itemsCol = (clubId: string) => collection(db, "clubs", clubId, "payItems");
const ordersCol = (clubId: string) => collection(db, "clubs", clubId, "payOrders");
const nowIso = () => new Date().toISOString();

/** Copy only non-empty optional strings (rules reject nulls). */
function optional(fields: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    const t = v?.trim();
    if (t) out[k] = t;
  }
  return out;
}

export function subscribePayMethods(clubId: string, onData: (m: PayMethod[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    methodsCol(clubId),
    (snap) => onData(sortPayMethods(snap.docs.map((d) => ({ ...(d.data() as Omit<PayMethod, "id">), id: d.id })))),
    (e) => onError?.(e),
  );
}

export function subscribePayItems(clubId: string, onData: (items: PayItem[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    itemsCol(clubId),
    (snap) => onData(sortPayItems(snap.docs.map((d) => ({ ...(d.data() as Omit<PayItem, "id">), id: d.id })))),
    (e) => onError?.(e),
  );
}

/** Everyone's (managers) or just mine — a member's query must filter on uid. */
export function subscribePayOrders(
  clubId: string,
  scope: { all: true } | { uid: string },
  onData: (orders: PayOrder[]) => void,
  onError?: (e: Error) => void,
) {
  const q = "all" in scope ? ordersCol(clubId) : query(ordersCol(clubId), where("uid", "==", scope.uid));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ ...(d.data() as Omit<PayOrder, "id">), id: d.id }))),
    (e) => onError?.(e),
  );
}

export interface PayMethodDraft {
  kind: PayMethodKind;
  handle?: string;
  url?: string;
  qrUrl?: string;
  instructions?: string;
  label?: string;
}

export async function addPayMethod(clubId: string, d: PayMethodDraft, order: number): Promise<void> {
  await addDoc(methodsCol(clubId), {
    kind: d.kind,
    ...optional({ handle: d.handle, url: d.url, qrUrl: d.qrUrl, instructions: d.instructions, label: d.label }),
    order,
    createdAt: nowIso(),
  });
}

export async function updatePayMethod(clubId: string, id: string, d: PayMethodDraft): Promise<void> {
  const set = (v: string | undefined) => (v?.trim() ? v.trim() : deleteField());
  await updateDoc(doc(methodsCol(clubId), id), {
    kind: d.kind,
    handle: set(d.handle),
    url: set(d.url),
    qrUrl: set(d.qrUrl),
    instructions: set(d.instructions),
    label: set(d.label),
  });
}

export async function deletePayMethod(clubId: string, id: string): Promise<void> {
  await deleteDoc(doc(methodsCol(clubId), id));
}

/** Upload a QR code image (storage rules: managers only, images < 2 MB). */
export async function uploadPayQr(clubId: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size >= 2 * 1024 * 1024) throw new Error("That image is over 2 MB. Try a screenshot instead.");
  const ext = file.type === "image/png" ? "png" : "jpg";
  const r = ref(storage, `clubs/${clubId}/payments/qr-${Date.now()}.${ext}`);
  await uploadBytes(r, file, { contentType: file.type });
  return getDownloadURL(r);
}

export interface PayItemDraft {
  title: string;
  description?: string;
  kind: PayItemKind;
  priceCents: number;
  options: string[];
  stock?: Record<string, number>;
  active: boolean;
}

export async function addPayItem(clubId: string, uid: string, d: PayItemDraft, order: number): Promise<void> {
  await addDoc(itemsCol(clubId), {
    title: d.title.trim(),
    ...optional({ description: d.description }),
    kind: d.kind,
    priceCents: d.priceCents,
    ...(d.options.length ? { options: d.options } : {}),
    ...(d.stock ? { stock: d.stock } : {}),
    active: d.active,
    order,
    createdBy: uid,
    createdAt: nowIso(),
  });
}

export async function updatePayItem(clubId: string, id: string, d: PayItemDraft): Promise<void> {
  await updateDoc(doc(itemsCol(clubId), id), {
    title: d.title.trim(),
    description: d.description?.trim() ? d.description.trim() : deleteField(),
    kind: d.kind,
    priceCents: d.priceCents,
    options: d.options.length ? d.options : deleteField(),
    stock: d.stock ? d.stock : deleteField(),
    active: d.active,
  });
}

export async function deletePayItem(clubId: string, id: string): Promise<void> {
  await deleteDoc(doc(itemsCol(clubId), id));
}

export interface NewOrder {
  uid: string;
  name: string;
  item: Pick<PayItem, "id" | "title" | "kind" | "priceCents">;
  option?: string;
  qty: number;
  method: string;
  note?: string;
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

export async function setPayOrderStatus(clubId: string, id: string, status: PayOrderStatus, byUid: string): Promise<void> {
  const now = nowIso();
  await updateDoc(doc(ordersCol(clubId), id), {
    status,
    updatedAt: now,
    ...(status === "confirmed"
      ? { confirmedAt: now, confirmedBy: byUid }
      : { confirmedAt: deleteField(), confirmedBy: deleteField() }),
  });
}

export async function cancelMyPayOrder(clubId: string, id: string): Promise<void> {
  await updateDoc(doc(ordersCol(clubId), id), { status: "cancelled", updatedAt: nowIso() });
}

export async function deletePayOrder(clubId: string, id: string): Promise<void> {
  await deleteDoc(doc(ordersCol(clubId), id));
}

export async function setTreasurer(clubId: string, uid: string, treasurer: boolean): Promise<void> {
  await updateDoc(doc(db, "clubs", clubId, "members", uid), { treasurer: treasurer ? true : deleteField() });
}
