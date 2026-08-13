import {
  assignSeat,
  findSeatOf,
  isGuestStillGoing,
  seatableGuests,
  seatHolds,
  type BoatAssignment,
  type EventRsvp,
} from "../club";

/** An empty OC6, the club's default boat. */
const oc6 = (name = "Boat 1"): BoatAssignment => ({
  boatName: name,
  boatType: "OC6",
  seats: Array.from({ length: 6 }, (_, i) => ({ seatNumber: i + 1, uid: null })),
});

const rsvp = (uid: string, status: EventRsvp["status"], guests?: string[]): EventRsvp => ({
  uid,
  status,
  updatedAt: "2026-08-13T00:00:00.000Z",
  ...(guests ? { guests } : {}),
});

describe("seatableGuests", () => {
  it("offers guests brought by members who are going", () => {
    expect(seatableGuests([rsvp("m1", "going", ["Kai", "Leilani"])])).toEqual([
      { hostUid: "m1", name: "Kai" },
      { hostUid: "m1", name: "Leilani" },
    ]);
  });

  it("ignores guests of members who are not going", () => {
    // A guest is only on the water if the member bringing them is.
    const rsvps = [rsvp("m1", "maybe", ["Kai"]), rsvp("m2", "not_going", ["Nalu"])];
    expect(seatableGuests(rsvps)).toEqual([]);
  });

  it("keeps same-named guests of different hosts apart", () => {
    const rsvps = [rsvp("m1", "going", ["Kai"]), rsvp("m2", "going", ["Kai"])];
    const guests = seatableGuests(rsvps);
    expect(guests).toHaveLength(2);
    expect(seatHolds({ seatNumber: 1, uid: null, guest: guests[0] }, { guest: guests[1]! })).toBe(
      false,
    );
  });
});

describe("assignSeat", () => {
  it("seats a guest, which was impossible before — the bug this fixes", () => {
    const next = assignSeat([oc6()], 0, 2, { guest: { hostUid: "m1", name: "Kai" } });
    expect(next[0]!.seats[2]).toEqual({
      seatNumber: 3,
      uid: null,
      guest: { hostUid: "m1", name: "Kai" },
    });
  });

  it("moves a member rather than seating them twice", () => {
    let boats = [oc6()];
    boats = assignSeat(boats, 0, 0, { uid: "m1" });
    boats = assignSeat(boats, 0, 4, { uid: "m1" });

    expect(boats[0]!.seats[0]!.uid).toBeNull();
    expect(boats[0]!.seats[4]!.uid).toBe("m1");
    expect(boats[0]!.seats.filter((s) => s.uid === "m1")).toHaveLength(1);
  });

  it("moves a member out of another boat, not just the one being edited", () => {
    let boats = [oc6("Boat 1"), oc6("Boat 2")];
    boats = assignSeat(boats, 0, 1, { uid: "m1" });
    boats = assignSeat(boats, 1, 3, { uid: "m1" });

    expect(boats[0]!.seats[1]!.uid).toBeNull();
    expect(boats[1]!.seats[3]!.uid).toBe("m1");
  });

  it("moves a guest rather than seating them twice", () => {
    const kai = { hostUid: "m1", name: "Kai" };
    let boats = [oc6()];
    boats = assignSeat(boats, 0, 0, { guest: kai });
    boats = assignSeat(boats, 0, 5, { guest: kai });

    expect(boats[0]!.seats[0]!.guest).toBeNull();
    expect(boats[0]!.seats[5]!.guest).toEqual(kai);
  });

  it("leaves a same-named guest of another host in place", () => {
    // Two Kais, different hosts — seating one must not vacate the other.
    let boats = [oc6()];
    boats = assignSeat(boats, 0, 0, { guest: { hostUid: "m1", name: "Kai" } });
    boats = assignSeat(boats, 0, 1, { guest: { hostUid: "m2", name: "Kai" } });

    expect(boats[0]!.seats[0]!.guest).toEqual({ hostUid: "m1", name: "Kai" });
    expect(boats[0]!.seats[1]!.guest).toEqual({ hostUid: "m2", name: "Kai" });
  });

  it("clears both occupant fields when swapping a guest for a member", () => {
    let boats = [oc6()];
    boats = assignSeat(boats, 0, 0, { guest: { hostUid: "m1", name: "Kai" } });
    boats = assignSeat(boats, 0, 0, { uid: "m2" });

    expect(boats[0]!.seats[0]!.uid).toBe("m2");
    expect(boats[0]!.seats[0]!.guest).toBeNull();
  });

  it("writes explicit nulls, never undefined, since Firestore rejects those", () => {
    const seat = assignSeat([oc6()], 0, 0, null)[0]!.seats[0]!;
    expect(seat.uid).toBeNull();
    expect(seat.guest).toBeNull();
    expect(Object.values(seat).some((v) => v === undefined)).toBe(false);
  });

  it("does not mutate the boats it was given", () => {
    const boats = [oc6()];
    assignSeat(boats, 0, 0, { uid: "m1" });
    expect(boats[0]!.seats[0]!.uid).toBeNull();
  });

  it("leaves the lineup alone when the seat does not exist", () => {
    const boats = [oc6()];
    expect(assignSeat(boats, 9, 0, { uid: "m1" })).toEqual(boats);
    expect(assignSeat(boats, 0, 99, { uid: "m1" })).toEqual(boats);
  });
});

describe("findSeatOf", () => {
  it("reports where someone is sitting, and nothing when they are not", () => {
    const boats = assignSeat([oc6(), oc6("Boat 2")], 1, 2, { uid: "m1" });
    expect(findSeatOf(boats, { uid: "m1" })).toEqual({ boatIdx: 1, seatIdx: 2 });
    expect(findSeatOf(boats, { uid: "m2" })).toBeNull();
  });

  it("does not mistake an empty seat for holding a guest", () => {
    // Every empty seat has guest null; a lookup must not match them all.
    const boats = [oc6()];
    expect(findSeatOf(boats, { guest: { hostUid: "m1", name: "Kai" } })).toBeNull();
  });
});

describe("isGuestStillGoing", () => {
  it("spots a guest the host has since withdrawn", () => {
    const kai = { hostUid: "m1", name: "Kai" };
    expect(isGuestStillGoing(kai, [rsvp("m1", "going", ["Kai"])])).toBe(true);
    expect(isGuestStillGoing(kai, [rsvp("m1", "going", ["Leilani"])])).toBe(false);
    expect(isGuestStillGoing(kai, [rsvp("m1", "not_going", ["Kai"])])).toBe(false);
  });
});
