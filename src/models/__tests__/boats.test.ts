import { BOAT_SPECS, boatSeatCount, inferBoatType } from "../club";

describe("boatSeatCount", () => {
  it("seats a DB20 as 20 paddlers plus a drummer and a steer", () => {
    expect(BOAT_SPECS.DB20.paddlerSeats).toBe(20);
    expect(boatSeatCount("DB20")).toBe(22);
  });

  it("halves the paddlers on a DB10 but keeps both crew", () => {
    // 12, not 11 — a smaller dragon boat still carries one drummer and one
    // steer, so the crew doesn't halve with the paddlers.
    expect(BOAT_SPECS.DB10.paddlerSeats).toBe(10);
    expect(boatSeatCount("DB10")).toBe(12);
  });

  it("gives outrigger hulls no crew seats beyond their paddlers", () => {
    expect(boatSeatCount("OC6")).toBe(6);
    expect(boatSeatCount("OC1")).toBe(1);
    expect(BOAT_SPECS.OC6.crewSeats).toHaveLength(0);
  });

  it("pairs only the dragon boats", () => {
    expect(BOAT_SPECS.DB10.paired).toBe(true);
    expect(BOAT_SPECS.DB20.paired).toBe(true);
    expect(BOAT_SPECS.OC6.paired).toBe(false);
  });

  it("puts the drummer at the bow and the steer at the stern", () => {
    expect(BOAT_SPECS.DB20.crewSeats).toEqual([
      { label: "Drummer", position: "bow" },
      { label: "Steer", position: "stern" },
    ]);
  });
});

describe("inferBoatType", () => {
  it("recognises current seat counts", () => {
    expect(inferBoatType(22)).toBe("DB20");
    expect(inferBoatType(12)).toBe("DB10");
    expect(inferBoatType(6)).toBe("OC6");
  });

  it("still recognises lineups saved before crew seats existed", () => {
    expect(inferBoatType(20)).toBe("DB20");
    expect(inferBoatType(10)).toBe("DB10");
  });

  it("returns null for a size no boat uses", () => {
    expect(inferBoatType(7)).toBeNull();
    expect(inferBoatType(0)).toBeNull();
  });
});
