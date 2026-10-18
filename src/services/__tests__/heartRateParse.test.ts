import { parseHeartRateMeasurement, usableBpm } from "../heartRateParse";

describe("parseHeartRateMeasurement", () => {
  it("reads an 8-bit heart rate with no optional fields", () => {
    // flags 0x00: uint8 value, contact not supported, nothing else present.
    expect(parseHeartRateMeasurement([0x00, 72])).toEqual({ bpm: 72, contact: null, rrMs: [] });
  });

  it("reads a 16-bit little-endian heart rate", () => {
    // flags 0x01: uint16. 0x00B4 = 180.
    expect(parseHeartRateMeasurement([0x01, 0xb4, 0x00])?.bpm).toBe(180);
  });

  it("reports skin contact when the strap supports it", () => {
    // 0x06: contact supported (bit 2) + detected (bit 1).
    expect(parseHeartRateMeasurement([0x06, 140])?.contact).toBe(true);
    // 0x04: supported but not detected — strap slipped off.
    expect(parseHeartRateMeasurement([0x04, 140])?.contact).toBe(false);
  });

  it("skips energy expended to reach the RR intervals", () => {
    // 0x18: energy present (bit 3) + RR present (bit 4).
    // HR 150, energy 0x0102 (ignored), RR 1024/1024 s = 1000 ms, 512 = 500 ms.
    const m = parseHeartRateMeasurement([0x18, 150, 0x02, 0x01, 0x00, 0x04, 0x00, 0x02]);
    expect(m).toEqual({ bpm: 150, contact: null, rrMs: [1000, 500] });
  });

  it("parses what a Garmin-style strap sends: contact plus RR, 8-bit HR", () => {
    // 0x16: contact supported + detected, RR present. RR 0x0300 = 768/1024 s = 750 ms.
    const m = parseHeartRateMeasurement([0x16, 80, 0x00, 0x03]);
    expect(m).toEqual({ bpm: 80, contact: true, rrMs: [750] });
  });

  it("ignores a trailing odd byte rather than misreading it as an interval", () => {
    expect(parseHeartRateMeasurement([0x10, 90, 0x00, 0x04, 0x07])?.rrMs).toEqual([1000]);
  });

  it("rejects payloads too short to hold a heart rate", () => {
    expect(parseHeartRateMeasurement([])).toBeNull();
    expect(parseHeartRateMeasurement([0x00])).toBeNull();
    expect(parseHeartRateMeasurement([0x01, 0xb4])).toBeNull(); // 16-bit flag, one byte
  });
});

describe("usableBpm", () => {
  it("passes through a normal reading", () => {
    expect(usableBpm({ bpm: 132, contact: true, rrMs: [] })).toBe(132);
    expect(usableBpm({ bpm: 132, contact: null, rrMs: [] })).toBe(132);
  });

  it("drops readings when the strap reports no skin contact", () => {
    expect(usableBpm({ bpm: 132, contact: false, rrMs: [] })).toBeNull();
  });

  it("drops the zero and out-of-range values straps send while settling", () => {
    expect(usableBpm({ bpm: 0, contact: null, rrMs: [] })).toBeNull();
    expect(usableBpm({ bpm: 255, contact: null, rrMs: [] })).toBeNull();
  });

  it("handles a missing measurement", () => {
    expect(usableBpm(null)).toBeNull();
  });
});
