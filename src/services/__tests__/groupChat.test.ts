import {
  GROUP_MAX_MEMBERS,
  GROUP_NAME_MAX,
  GroupChatInputError,
  groupPushText,
  normalizeAddedMembers,
  normalizeGroupName,
  normalizeNewGroupMembers,
} from "../../../firebase/functions/src/groupChat";
import { dmThreadTitle, groupMemberSummary } from "@/models/club";

const uids = (n: number, p = "u") => Array.from({ length: n }, (_, i) => `${p}${i}`);

describe("normalizeGroupName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeGroupName("  Sat   carpool ")).toBe("Sat carpool");
  });
  it("rejects empty, non-string and over-long names", () => {
    expect(() => normalizeGroupName("   ")).toThrow(GroupChatInputError);
    expect(() => normalizeGroupName(42)).toThrow(GroupChatInputError);
    expect(() => normalizeGroupName("x".repeat(GROUP_NAME_MAX + 1))).toThrow(GroupChatInputError);
    expect(normalizeGroupName("x".repeat(GROUP_NAME_MAX))).toHaveLength(GROUP_NAME_MAX);
  });
});

describe("normalizeNewGroupMembers", () => {
  it("dedupes and drops the caller", () => {
    expect(normalizeNewGroupMembers("me", ["a", "b", "a", "me"])).toEqual(["a", "b"]);
  });
  it("needs at least two other people (one is a DM)", () => {
    expect(() => normalizeNewGroupMembers("me", ["a"])).toThrow(/direct message/);
    expect(() => normalizeNewGroupMembers("me", ["a", "me"])).toThrow(GroupChatInputError);
  });
  it("caps the group, counting the creator", () => {
    expect(normalizeNewGroupMembers("me", uids(GROUP_MAX_MEMBERS - 1))).toHaveLength(GROUP_MAX_MEMBERS - 1);
    expect(() => normalizeNewGroupMembers("me", uids(GROUP_MAX_MEMBERS))).toThrow(GroupChatInputError);
  });
  it("rejects malformed input", () => {
    expect(() => normalizeNewGroupMembers("me", "a,b")).toThrow(GroupChatInputError);
    expect(() => normalizeNewGroupMembers("me", ["a", ""])).toThrow(GroupChatInputError);
    expect(() => normalizeNewGroupMembers("me", ["a", 3])).toThrow(GroupChatInputError);
  });
});

describe("normalizeAddedMembers", () => {
  it("only adds people not already in the group", () => {
    expect(normalizeAddedMembers(["me", "a", "b"], ["b", "c", "c"])).toEqual(["c"]);
    expect(() => normalizeAddedMembers(["me", "a"], ["a"])).toThrow(/already/);
  });
  it("respects the cap", () => {
    const current = uids(GROUP_MAX_MEMBERS - 1, "x");
    expect(normalizeAddedMembers(current, ["new"])).toEqual(["new"]);
    expect(() => normalizeAddedMembers(current, ["n1", "n2"])).toThrow(GroupChatInputError);
  });
});

describe("groupPushText", () => {
  it("titles the push with the group and leads with the sender", () => {
    expect(groupPushText("Sat carpool", "Kai", "who's driving?")).toEqual({
      title: "Sat carpool",
      body: "Kai: who's driving?",
    });
  });
});

describe("dmThreadTitle / groupMemberSummary", () => {
  const names = { me: "Kendall D", a: "Kai Akana", b: "Noa Lee", c: "Lani K", d: "Mele P" };

  it("uses the group name, or the other person in a DM", () => {
    expect(dmThreadTitle({ isGroup: true, name: "OC6 crew", participants: ["me", "a", "b"], participantNames: names }, "me")).toBe("OC6 crew");
    expect(dmThreadTitle({ participants: ["a", "me"], participantNames: names }, "me")).toBe("Kai Akana");
    expect(dmThreadTitle({ isGroup: true, name: "  ", participants: ["me"], participantNames: names }, "me")).toBe("Group chat");
  });

  it("summarises who else is in a group by first name", () => {
    expect(groupMemberSummary({ participants: ["me", "a", "b"], participantNames: names }, "me")).toBe("Kai and Noa");
    expect(groupMemberSummary({ participants: ["me", "a", "b", "c"], participantNames: names }, "me")).toBe("Kai, Noa and Lani");
    expect(groupMemberSummary({ participants: ["me", "a", "b", "c", "d"], participantNames: names }, "me")).toBe("Kai, Noa and 2 others");
    expect(groupMemberSummary({ participants: ["me"], participantNames: names }, "me")).toBe("Just you");
  });
});

describe("isDmThreadHidden", () => {
  // Imported lazily to keep this file's group-chat focus clear above.
  const { isDmThreadHidden } = jest.requireActual("@/models/club") as typeof import("@/models/club");
  const t = (lastMessageAt?: string) => ({ createdAt: "2026-11-01T00:00:00.000Z", ...(lastMessageAt ? { lastMessageAt } : {}) });

  it("stays hidden while nothing newer has happened", () => {
    expect(isDmThreadHidden(t("2026-11-05T10:00:00.000Z"), "2026-11-06T00:00:00.000Z")).toBe(true);
    // A brand-new thread with no messages yet uses createdAt.
    expect(isDmThreadHidden(t(), "2026-11-02T00:00:00.000Z")).toBe(true);
  });

  it("comes back when a newer message arrives", () => {
    expect(isDmThreadHidden(t("2026-11-07T08:00:00.000Z"), "2026-11-06T00:00:00.000Z")).toBe(false);
  });

  it("comes back if anything is unread, even if the preview time lags", () => {
    expect(isDmThreadHidden(t("2026-11-05T10:00:00.000Z"), "2026-11-06T00:00:00.000Z", 1)).toBe(false);
  });

  it("isn't hidden without a hiddenAt", () => {
    expect(isDmThreadHidden(t("2026-11-05T10:00:00.000Z"), undefined)).toBe(false);
  });
});
