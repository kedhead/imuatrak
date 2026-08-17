import { clubGrantsAdFree, eventGoingCount, MAX_POST_TAGS, parseHashtags, type EventRsvp } from "../club";

describe("eventGoingCount", () => {
  const rsvp = (uid: string, status: EventRsvp["status"], guests?: string[]): EventRsvp => ({
    uid,
    status,
    updatedAt: "2026-07-13T12:00:00.000Z",
    ...(guests ? { guests } : {}),
  });

  it("counts only going members", () => {
    expect(
      eventGoingCount([rsvp("a", "going"), rsvp("b", "maybe"), rsvp("c", "not_going")]),
    ).toBe(1);
  });

  it("adds guests brought by going members", () => {
    expect(eventGoingCount([rsvp("a", "going", ["Kai", "Leilani"])])).toBe(3);
  });

  it("ignores guests attached to members who are not going", () => {
    expect(eventGoingCount([rsvp("a", "maybe", ["Kai"]), rsvp("b", "not_going", ["Noa"])])).toBe(0);
  });

  it("is zero for an event with no RSVPs", () => {
    expect(eventGoingCount([])).toBe(0);
  });
});

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

  it("is false for a free club (the default — no automatic trial)", () => {
    expect(clubGrantsAdFree({ subscriptionStatus: "free" }, now)).toBe(false);
  });
});

describe("parseHashtags", () => {
  it("extracts tags and drops the #", () => {
    expect(parseHashtags("Great day out #raceday #crew")).toEqual(["raceday", "crew"]);
  });

  it("lower-cases so #RaceDay and #raceday filter as one tag", () => {
    expect(parseHashtags("#RaceDay then #raceday")).toEqual(["raceday"]);
  });

  it("returns nothing for a caption with no tags", () => {
    expect(parseHashtags("just a photo")).toEqual([]);
  });

  it("ignores a bare # with no word after it", () => {
    expect(parseHashtags("number # 1 #winning")).toEqual(["winning"]);
  });

  // Matters for a paddling app: the ʻokina is a letter, so Hawaiian place and
  // crew names survive as one tag instead of being cut at the mark.
  it("keeps macrons and ʻokina inside a tag", () => {
    expect(parseHashtags("#hoʻomau #Kāneʻohe")).toEqual(["hoʻomau", "kāneʻohe"]);
  });

  it("caps the number of tags stored", () => {
    const caption = Array.from({ length: 20 }, (_, i) => `#tag${i}`).join(" ");
    expect(parseHashtags(caption)).toHaveLength(MAX_POST_TAGS);
  });
});
