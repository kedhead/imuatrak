import { clubGrantsAdFree } from "../club";

describe("clubGrantsAdFree", () => {
  const now = new Date("2026-07-13T12:00:00Z");
  const future = "2026-08-01T00:00:00.000Z";
  const past = "2026-07-01T00:00:00.000Z";

  it("is false without a club", () => {
    expect(clubGrantsAdFree(null, now)).toBe(false);
    expect(clubGrantsAdFree(undefined, now)).toBe(false);
  });

  it("is true for an active subscription regardless of trialEndsAt", () => {
    expect(clubGrantsAdFree({ subscriptionStatus: "active" }, now)).toBe(true);
    expect(
      clubGrantsAdFree({ subscriptionStatus: "active", trialEndsAt: past }, now),
    ).toBe(true);
  });

  it("is true for a trial that has not ended", () => {
    expect(
      clubGrantsAdFree({ subscriptionStatus: "trial", trialEndsAt: future }, now),
    ).toBe(true);
  });

  it("is false for a trial past its trialEndsAt, even before the daily sweep flips it", () => {
    expect(
      clubGrantsAdFree({ subscriptionStatus: "trial", trialEndsAt: past }, now),
    ).toBe(false);
  });

  it("is false for a trial with no trialEndsAt", () => {
    expect(clubGrantsAdFree({ subscriptionStatus: "trial" }, now)).toBe(false);
  });

  it("is false for an expired subscription", () => {
    expect(
      clubGrantsAdFree({ subscriptionStatus: "expired", trialEndsAt: future }, now),
    ).toBe(false);
  });
});
