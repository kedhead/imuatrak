/**
 * Club payments: how a club takes dues and sells merch.
 *
 * ImuaTrak never touches the money. A club lists the ways it accepts payment
 * (Zelle, Venmo, PayPal, Cash App, a store link, or plain instructions) and
 * the things members pay for. A member picks an item, pays through their own
 * app with the amount and memo filled in where that app allows it, then taps
 * "I paid". The treasurer confirms it once the money shows up.
 *
 * Mirrored in web/lib/payments.ts and checked by firestore.rules
 * (payMethods / payItems / payOrders), so keep the shapes in step.
 */
import type { ClubMember, MemberRole } from "./club";

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
