import {
  SIGNUP_ITEMS_MAX,
  SIGNUP_LABEL_MAX,
  SIGNUP_SLOTS_MAX,
  SIGNUP_TEMPLATES,
  clampSlots,
  hasClaimed,
  openSlots,
  signupProgress,
  sortSignupItems,
  sortedClaims,
  type SignupItem,
} from "../club";

const item = (over: Partial<SignupItem> & { id: string }): SignupItem => ({
  label: "Dessert",
  slots: 3,
  order: 0,
  createdBy: "coach",
  createdAt: "2026-10-01T00:00:00.000Z",
  claims: {},
  ...over,
});

const claim = (at: string, note?: string) => ({
  name: "Someone",
  claimedAt: at,
  ...(note ? { note } : {}),
});

describe("openSlots / hasClaimed", () => {
  it("counts remaining slots and never goes negative", () => {
    const a = item({ id: "a", slots: 2, claims: { u1: claim("t1") } });
    expect(openSlots(a)).toBe(1);
    const over = item({ id: "b", slots: 1, claims: { u1: claim("t1"), u2: claim("t2") } });
    expect(openSlots(over)).toBe(0);
  });

  it("knows whether a uid holds a slot", () => {
    const a = item({ id: "a", claims: { u1: claim("t1") } });
    expect(hasClaimed(a, "u1")).toBe(true);
    expect(hasClaimed(a, "u2")).toBe(false);
    expect(hasClaimed(a, undefined)).toBe(false);
  });
});

describe("signupProgress", () => {
  it("sums filled and total slots across items", () => {
    expect(
      signupProgress([
        item({ id: "a", slots: 3, claims: { u1: claim("t1") } }),
        item({ id: "b", slots: 2, claims: { u1: claim("t1"), u2: claim("t2") } }),
      ]),
    ).toEqual({ filled: 3, total: 5 });
  });

  it("caps an over-claimed item at its slot count", () => {
    const over = item({ id: "a", slots: 1, claims: { u1: claim("t1"), u2: claim("t2") } });
    expect(signupProgress([over])).toEqual({ filled: 1, total: 1 });
  });

  it("is zero for an empty sheet", () => {
    expect(signupProgress([])).toEqual({ filled: 0, total: 0 });
  });
});

describe("sortSignupItems", () => {
  it("puts staff items in order, then write-ins by time", () => {
    const sorted = sortSignupItems([
      item({ id: "w2", writeIn: true, createdAt: "2026-10-03T00:00:00.000Z" }),
      item({ id: "s2", order: 1 }),
      item({ id: "w1", writeIn: true, createdAt: "2026-10-02T00:00:00.000Z" }),
      item({ id: "s1", order: 0 }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["s1", "s2", "w1", "w2"]);
  });
});

describe("sortedClaims", () => {
  it("lists earliest sign-ups first and keeps the uid", () => {
    const a = item({
      id: "a",
      claims: { late: claim("2026-10-02"), early: claim("2026-10-01", "Haupia") },
    });
    expect(sortedClaims(a).map((c) => [c.uid, c.note])).toEqual([
      ["early", "Haupia"],
      ["late", undefined],
    ]);
  });
});

describe("clampSlots", () => {
  it("keeps slot counts within 1..max and above a floor", () => {
    expect(clampSlots(0)).toBe(1);
    expect(clampSlots(2.7)).toBe(2);
    expect(clampSlots(999)).toBe(SIGNUP_SLOTS_MAX);
    expect(clampSlots(1, 3)).toBe(3);
    expect(clampSlots(Number.NaN)).toBe(1);
  });
});

describe("SIGNUP_TEMPLATES", () => {
  it("offers more than just food", () => {
    expect(SIGNUP_TEMPLATES.map((t) => t.id)).toEqual(
      expect.arrayContaining(["potluck", "gear", "volunteers"]),
    );
  });

  it("has unique ids", () => {
    const ids = SIGNUP_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only contains items the rules will accept", () => {
    for (const t of SIGNUP_TEMPLATES) {
      expect(t.items.length).toBeGreaterThan(0);
      expect(t.items.length).toBeLessThanOrEqual(SIGNUP_ITEMS_MAX);
      for (const it of t.items) {
        expect(it.label.length).toBeGreaterThan(0);
        expect(it.label.length).toBeLessThanOrEqual(SIGNUP_LABEL_MAX);
        expect(it.slots).toBe(clampSlots(it.slots));
        expect((it.details ?? "").length).toBeLessThanOrEqual(120);
      }
    }
  });

  it("has no duplicate labels inside one template", () => {
    for (const t of SIGNUP_TEMPLATES) {
      const labels = t.items.map((i) => i.label.toLowerCase());
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});
