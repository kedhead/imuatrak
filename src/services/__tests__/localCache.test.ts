jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearCache, decodeEntry, encodeEntry, readCache, writeCache } from "../localCache";
import { withGuestAdded, withRsvp, type EventRsvp } from "@/models/club";

const DAY = 24 * 60 * 60 * 1000;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("localCache entries", () => {
  it("round-trips a value", () => {
    expect(decodeEntry(encodeEntry({ a: [1, 2] }, 1000), 2000)).toEqual({ a: [1, 2] });
  });

  it("ignores missing, corrupt, too-old and future-dated entries", () => {
    expect(decodeEntry(null)).toBeNull();
    expect(decodeEntry("{not json")).toBeNull();
    expect(decodeEntry(JSON.stringify({ value: 1 }))).toBeNull();
    expect(decodeEntry(encodeEntry("x", 0), 15 * DAY)).toBeNull();
    expect(decodeEntry(encodeEntry("x", 0), 13 * DAY)).toBe("x");
    // Clock moved backwards a long way: don't trust it.
    expect(decodeEntry(encodeEntry("x", 10 * DAY), 0)).toBeNull();
  });
});

describe("localCache storage", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("keeps each account's data separate", async () => {
    writeCache("kai", "club", { name: "Kai's club" });
    writeCache("noa", "club", { name: "Noa's club" });
    await flush();
    expect(await readCache("kai", "club")).toEqual({ name: "Kai's club" });
    expect(await readCache("noa", "club")).toEqual({ name: "Noa's club" });
    expect(await readCache("lani", "club")).toBeNull();
  });

  it("clearCache removes cached data but nothing else in storage", async () => {
    writeCache("kai", "club", { a: 1 });
    writeCache("kai", "feed:c1", { b: 2 });
    await AsyncStorage.setItem("settings", "keep-me");
    await flush();
    await clearCache();
    expect(await readCache("kai", "club")).toBeNull();
    expect(await readCache("kai", "feed:c1")).toBeNull();
    expect(await AsyncStorage.getItem("settings")).toBe("keep-me");
  });
});

describe("withRsvp / withGuestAdded", () => {
  const at = "2026-11-10T00:00:00.000Z";
  const base: EventRsvp[] = [
    { uid: "kai", status: "going", updatedAt: "old", guests: ["Mele"] },
    { uid: "noa", status: "maybe", updatedAt: "old" },
  ];

  it("replaces only that member's entry and doesn't mutate the input", () => {
    const next = withRsvp(base, "noa", "going", undefined, at);
    expect(next).toHaveLength(2);
    expect(next.find((r) => r.uid === "noa")).toEqual({ uid: "noa", status: "going", updatedAt: at });
    expect(next.find((r) => r.uid === "kai")).toBe(base[0]);
    expect(base[1]!.status).toBe("maybe");
  });

  it("keeps guests across a status change unless a new list is given", () => {
    expect(withRsvp(base, "kai", "maybe", undefined, at).find((r) => r.uid === "kai")!.guests).toEqual(["Mele"]);
    expect(withRsvp(base, "kai", "going", [], at).find((r) => r.uid === "kai")!.guests).toBeUndefined();
  });

  it("adds a new member, and adding a guest means going", () => {
    expect(withRsvp(base, "lani", "not_going", undefined, at)).toHaveLength(3);
    const g = withGuestAdded(base, "noa", "Keoni", at).find((r) => r.uid === "noa")!;
    expect(g).toEqual({ uid: "noa", status: "going", updatedAt: at, guests: ["Keoni"] });
    expect(withGuestAdded(base, "kai", "Keoni", at).find((r) => r.uid === "kai")!.guests).toEqual(["Mele", "Keoni"]);
  });
});
