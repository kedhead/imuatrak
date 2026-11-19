import {
  amountParam,
  canManagePayments,
  cleanHandle,
  duesStatusByMember,
  formatMoney,
  isSoldOut,
  orderTotals,
  parseMoney,
  payLink,
  paymentMemo,
  remainingStock,
  sortOrders,
  sortPayItems,
} from "../payments";

describe("money", () => {
  it("formats whole and fractional dollars", () => {
    expect(formatMoney(2500)).toBe("$25");
    expect(formatMoney(2550)).toBe("$25.50");
    expect(formatMoney(5)).toBe("$0.05");
    expect(formatMoney(150000)).toBe("$1,500");
    expect(formatMoney(0)).toBe("$0");
  });

  it("parses typed prices", () => {
    expect(parseMoney("25")).toBe(2500);
    expect(parseMoney("$25.5")).toBe(2550);
    expect(parseMoney(" 1,000.00 ")).toBe(100000);
    expect(parseMoney("0")).toBe(0);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("1.234")).toBeNull();
    expect(parseMoney("-5")).toBeNull();
    expect(parseMoney("20000")).toBeNull(); // over $10,000
  });

  it("formats link amounts", () => {
    expect(amountParam(2500)).toBe("25");
    expect(amountParam(2550)).toBe("25.50");
  });
});

describe("payLink", () => {
  it("builds Venmo with amount and memo", () => {
    expect(payLink({ kind: "venmo", handle: "@Club-Treasurer" }, 15000, "Dues – Kai K.")).toBe(
      "https://venmo.com/?txn=pay&recipients=Club-Treasurer&amount=150&note=Dues%20%E2%80%93%20Kai%20K.",
    );
  });

  it("builds PayPal.me and Cash App", () => {
    expect(payLink({ kind: "paypal", handle: "https://paypal.me/myclub" }, 2550, "x")).toBe(
      "https://paypal.me/myclub/25.50",
    );
    expect(payLink({ kind: "cashapp", handle: "$MyClub" }, 2000, "x")).toBe("https://cash.app/$MyClub/20");
  });

  it("omits the amount when free", () => {
    expect(payLink({ kind: "cashapp", handle: "MyClub" }, 0, "x")).toBe("https://cash.app/$MyClub");
  });

  it("passes store links through, adding https", () => {
    expect(payLink({ kind: "link", url: "shop.myclub.org" }, 100, "x")).toBe("https://shop.myclub.org");
    expect(payLink({ kind: "link", url: "https://a.b/c" }, 100, "x")).toBe("https://a.b/c");
  });

  it("has no link for Zelle or other", () => {
    expect(payLink({ kind: "zelle", handle: "a@b.c" }, 100, "x")).toBeNull();
    expect(payLink({ kind: "other" }, 100, "x")).toBeNull();
    expect(payLink({ kind: "venmo" }, 100, "x")).toBeNull();
  });

  it("cleans pasted handles", () => {
    expect(cleanHandle("venmo", "https://venmo.com/u/Kai-K")).toBe("Kai-K");
    expect(cleanHandle("cashapp", "https://cash.app/$kai")).toBe("kai");
    expect(cleanHandle("paypal", "paypal.me/kai/")).toBe("kai");
  });
});

describe("paymentMemo", () => {
  it("uses first name and last initial", () => {
    expect(paymentMemo("2027 Dues", "Kai Kahananui")).toBe("2027 Dues – Kai K.");
    expect(paymentMemo("T-shirt", "Leilani Mae Akana", "M", 2)).toBe("T-shirt (M) x2 – Leilani A.");
    expect(paymentMemo("T-shirt", "Kai")).toBe("T-shirt – Kai");
    expect(paymentMemo("T-shirt", "  ")).toBe("T-shirt");
  });
});

describe("stock", () => {
  const item = { options: ["S", "M"], stock: { S: 5, M: 2 }, sold: { M: 2, S: 1 } };
  it("counts what's left per option", () => {
    expect(remainingStock(item, "S")).toBe(4);
    expect(remainingStock(item, "M")).toBe(0);
    expect(remainingStock({}, undefined)).toBeNull();
    expect(remainingStock({ stock: { _: 3 }, sold: { _: 5 } })).toBe(0);
  });

  it("is sold out only when every option is", () => {
    expect(isSoldOut(item)).toBe(false);
    expect(isSoldOut({ ...item, sold: { S: 5, M: 2 } })).toBe(true);
    expect(isSoldOut({ stock: { _: 1 }, sold: { _: 1 } })).toBe(true);
    expect(isSoldOut({})).toBe(false);
  });
});

describe("dues + totals", () => {
  const members = [{ uid: "a" }, { uid: "b" }, { uid: "c" }, { uid: "d" }];
  const orders = [
    { uid: "a", itemId: "dues", status: "confirmed" as const, totalCents: 150 },
    { uid: "a", itemId: "dues", status: "pending" as const, totalCents: 150 },
    { uid: "b", itemId: "dues", status: "pending" as const, totalCents: 150 },
    { uid: "c", itemId: "dues", status: "cancelled" as const, totalCents: 150 },
    { uid: "d", itemId: "shirt", status: "confirmed" as const, totalCents: 25 },
    { uid: "gone", itemId: "dues", status: "confirmed" as const, totalCents: 150 },
  ];

  it("works out who has paid dues", () => {
    const s = duesStatusByMember("dues", members, orders);
    expect(s.get("a")).toBe("paid");
    expect(s.get("b")).toBe("pending");
    expect(s.get("c")).toBe("unpaid");
    expect(s.get("d")).toBe("unpaid");
    expect(s.has("gone")).toBe(false);
  });

  it("totals confirmed and pending", () => {
    expect(orderTotals(orders)).toEqual({ confirmedCents: 325, pendingCents: 300, pendingCount: 2 });
  });
});

describe("sorting + access", () => {
  it("puts dues first, then merch", () => {
    const sorted = sortPayItems([
      { id: "m", kind: "merch" as const, order: 0, createdAt: "1" },
      { id: "d", kind: "dues" as const, order: 5, createdAt: "2" },
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["d", "m"]);
  });

  it("puts pending orders first, newest first", () => {
    const sorted = sortOrders([
      { id: "1", status: "confirmed" as const, createdAt: "2026-01-03" },
      { id: "2", status: "pending" as const, createdAt: "2026-01-01" },
      { id: "3", status: "pending" as const, createdAt: "2026-01-02" },
    ]);
    expect(sorted.map((o) => o.id)).toEqual(["3", "2", "1"]);
  });

  it("lets staff and treasurers manage payments", () => {
    expect(canManagePayments("coach", null)).toBe(true);
    expect(canManagePayments("admin", null)).toBe(true);
    expect(canManagePayments("member", { treasurer: true })).toBe(true);
    expect(canManagePayments("member", {})).toBe(false);
    expect(canManagePayments(null, null)).toBe(false);
  });
});
