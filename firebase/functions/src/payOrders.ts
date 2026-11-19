/**
 * Pure helpers for the onPayOrderWrite trigger: how an order change moves the
 * item's stock counts, and which pushes it warrants.
 *
 * No Firebase imports, so the app's Jest can test it
 * (src/services/__tests__/payOrders.test.ts).
 */

export interface OrderSnapshot {
  uid: string;
  name?: string;
  itemId: string;
  itemTitle?: string;
  option?: string;
  qty: number;
  totalCents?: number;
  method?: string;
  status: string;
  recordedBy?: string;
  confirmedBy?: string;
}

/** Key used for an item with no options (mirrors NO_OPTION in the app). */
export const NO_OPTION = "_";

/** Pending and confirmed orders hold stock; cancelled ones release it. */
function holds(o: OrderSnapshot | undefined): boolean {
  return !!o && (o.status === "pending" || o.status === "confirmed");
}

/**
 * Stock changes as { itemId → { optionKey → delta } }. An order moving between
 * items or options (a treasurer edit) releases the old and takes the new.
 */
export function soldDeltas(
  before: OrderSnapshot | undefined,
  after: OrderSnapshot | undefined,
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  const add = (o: OrderSnapshot, sign: 1 | -1) => {
    const qty = Number.isInteger(o.qty) && o.qty > 0 ? o.qty : 0;
    if (!qty) return;
    const key = o.option ? o.option : NO_OPTION;
    const perItem = out.get(o.itemId) ?? new Map<string, number>();
    perItem.set(key, (perItem.get(key) ?? 0) + sign * qty);
    out.set(o.itemId, perItem);
  };
  if (holds(before)) add(before!, -1);
  if (holds(after)) add(after!, 1);
  // Drop zero entries (an edit that changed nothing stock-related).
  for (const [itemId, perItem] of out) {
    for (const [k, v] of perItem) if (v === 0) perItem.delete(k);
    if (perItem.size === 0) out.delete(itemId);
  }
  return out;
}

function money(cents: number | undefined): string {
  const c = Math.max(0, Math.round(cents ?? 0));
  const dollars = Math.floor(c / 100).toLocaleString("en-US");
  const rem = c % 100;
  return `$${dollars}${rem ? `.${String(rem).padStart(2, "0")}` : ""}`;
}

const METHOD_NAMES: Record<string, string> = {
  zelle: "Zelle",
  venmo: "Venmo",
  paypal: "PayPal",
  cashapp: "Cash App",
  link: "online",
  other: "other",
  cash: "cash",
};

export type PayPush =
  | { to: "managers"; title: string; body: string }
  | { to: "member"; uid: string; title: string; body: string };

/**
 * The push an order change warrants, if any:
 *  - a member's new "I paid" → the treasurer(s), to go and confirm it;
 *  - pending → confirmed by someone else → the member, so they know it landed.
 * Orders a treasurer entered themselves notify no one.
 */
export function payPushFor(
  before: OrderSnapshot | undefined,
  after: OrderSnapshot | undefined,
): PayPush | null {
  if (!after) return null;
  const what = `${after.itemTitle ?? "an item"}${after.option ? ` (${after.option})` : ""}${
    after.qty > 1 ? ` ×${after.qty}` : ""
  }`;
  if (!before && after.status === "pending" && !after.recordedBy) {
    const via = after.method ? METHOD_NAMES[after.method] ?? after.method : "";
    return {
      to: "managers",
      title: "💳 Payment to confirm",
      body: `${after.name ?? "A member"} paid ${money(after.totalCents)} for ${what}${via ? ` via ${via}` : ""}. Tap to confirm once it lands.`,
    };
  }
  if (before?.status === "pending" && after.status === "confirmed" && after.confirmedBy !== after.uid) {
    return {
      to: "member",
      uid: after.uid,
      title: "✅ Payment confirmed",
      body: `Your ${money(after.totalCents)} for ${what} was received. Mahalo!`,
    };
  }
  return null;
}
