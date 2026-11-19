import { useEffect, useState } from "react";
import type { PayItem, PayOrder } from "@/models/payments";
import { subscribePayItems, subscribePayOrders } from "@/services/paymentService";

/**
 * What the club home screen needs from payments, read once and shared by the
 * header's Store badge and the "Pay now" card: the first open dues item this
 * member hasn't paid, and (for treasurers) how many payments await
 * confirmation. Pass enabled=false for free clubs — nothing is read.
 */
export function usePaySummary(
  clubId: string | undefined,
  uid: string | undefined,
  isManager: boolean,
  enabled: boolean,
): { unpaidDues: PayItem | undefined; toConfirm: number; hasItems: boolean } {
  const [items, setItems] = useState<PayItem[]>([]);
  const [orders, setOrders] = useState<PayOrder[]>([]);
  const live = enabled && !!clubId && !!uid;

  useEffect(() => {
    if (!live) return;
    return subscribePayItems(clubId!, setItems, () => setItems([]));
  }, [live, clubId]);
  useEffect(() => {
    if (!live) return;
    return subscribePayOrders(clubId!, isManager ? { all: true } : { uid: uid! }, setOrders, () => setOrders([]));
  }, [live, clubId, uid, isManager]);

  if (!live) return { unpaidDues: undefined, toConfirm: 0, hasItems: false };
  const active = items.filter((i) => i.active);
  const mine = orders.filter((o) => o.uid === uid && o.status !== "cancelled");
  return {
    unpaidDues: active.find((i) => i.kind === "dues" && !mine.some((o) => o.itemId === i.id)),
    toConfirm: isManager ? orders.filter((o) => o.status === "pending").length : 0,
    hasItems: active.length > 0,
  };
}
