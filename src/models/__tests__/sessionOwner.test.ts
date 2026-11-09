import { canActOnSession, isUnownedSession } from "..";

describe("session ownership on this device", () => {
  it("treats watch transfers (\"\") and pre-sign-in recordings (\"anonymous\") as unowned", () => {
    expect(isUnownedSession({ userId: "" })).toBe(true);
    expect(isUnownedSession({ userId: "anonymous" })).toBe(true);
    expect(isUnownedSession({ userId: "kai" })).toBe(false);
  });

  it("lets the signed-in user act on their own or unowned sessions, not someone else's", () => {
    expect(canActOnSession({ userId: "kai" }, "kai")).toBe(true);
    expect(canActOnSession({ userId: "" }, "kai")).toBe(true);
    expect(canActOnSession({ userId: "anonymous" }, "kai")).toBe(true);
    expect(canActOnSession({ userId: "noa" }, "kai")).toBe(false);
  });
});
