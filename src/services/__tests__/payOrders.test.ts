import { payPushFor, soldDeltas, type OrderSnapshot } from "../../../firebase/functions/src/payOrders";

const base: OrderSnapshot = {
  uid: "kai",
  name: "Kai K",
  itemId: "shirt",
  itemTitle: "Club T-shirt",
  option: "M",
  qty: 2,
  totalCents: 5000,
  method: "venmo",
  status: "pending",
};

const flat = (m: Map<string, Map<string, number>>) =>
  Object.fromEntries([...m].map(([k, v]) => [k, Object.fromEntries(v)]));

describe("soldDeltas", () => {
  it("takes stock on a new order", () => {
    expect(flat(soldDeltas(undefined, base))).toEqual({ shirt: { M: 2 } });
  });

  it("does nothing when pending becomes confirmed", () => {
    expect(flat(soldDeltas(base, { ...base, status: "confirmed" }))).toEqual({});
  });

  it("releases stock on cancel and delete", () => {
    expect(flat(soldDeltas(base, { ...base, status: "cancelled" }))).toEqual({ shirt: { M: -2 } });
    expect(flat(soldDeltas({ ...base, status: "confirmed" }, undefined))).toEqual({ shirt: { M: -2 } });
    expect(flat(soldDeltas({ ...base, status: "cancelled" }, undefined))).toEqual({});
  });

  it("moves stock when a treasurer changes size or quantity", () => {
    expect(flat(soldDeltas(base, { ...base, option: "L", qty: 1 }))).toEqual({ shirt: { M: -2, L: 1 } });
  });

  it("uses the no-option key", () => {
    expect(flat(soldDeltas(undefined, { ...base, option: undefined, qty: 1 }))).toEqual({ shirt: { _: 1 } });
  });
});

describe("payPushFor", () => {
  it("tells the treasurer about a member's new payment", () => {
    const p = payPushFor(undefined, base);
    expect(p?.to).toBe("managers");
    expect(p?.body).toBe("Kai K paid $50 for Club T-shirt (M) ×2 via Venmo. Tap to confirm once it lands.");
  });

  it("stays quiet for one a treasurer recorded", () => {
    expect(payPushFor(undefined, { ...base, recordedBy: "lei", status: "confirmed" })).toBeNull();
    expect(payPushFor(undefined, { ...base, recordedBy: "lei" })).toBeNull();
  });

  it("tells the member when it's confirmed", () => {
    const p = payPushFor(base, { ...base, status: "confirmed", confirmedBy: "lei" });
    expect(p).toEqual({
      to: "member",
      uid: "kai",
      title: "✅ Payment confirmed",
      body: "Your $50 for Club T-shirt (M) ×2 was received. Mahalo!",
    });
  });

  it("doesn't notify a treasurer confirming their own", () => {
    expect(payPushFor(base, { ...base, status: "confirmed", confirmedBy: "kai" })).toBeNull();
  });

  it("ignores cancels and deletes", () => {
    expect(payPushFor(base, { ...base, status: "cancelled" })).toBeNull();
    expect(payPushFor(base, undefined)).toBeNull();
  });
});
