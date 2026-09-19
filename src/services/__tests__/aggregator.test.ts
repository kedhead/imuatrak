import type { TrackPoint } from "@/models";

import * as aggregator from "../aggregator";

/** Build a straight-line track heading north: one point every `stepM` meters / `stepSec` seconds. */
function makeTrack(
  count: number,
  stepM: number,
  stepSec: number,
  extras: (i: number) => Partial<TrackPoint> = () => ({}),
): TrackPoint[] {
  const degPerMeterLat = 1 / 111_320;
  const points: TrackPoint[] = [];
  for (let i = 0; i < count; i++) {
    points.push({
      t: i * stepSec,
      lat: 21.3 + i * stepM * degPerMeterLat,
      lon: -157.85,
      altM: 0,
      speedMps: stepM / stepSec,
      ...extras(i),
    });
  }
  return points;
}

describe("aggregator.splits", () => {
  it("averages strokeRate and hr samples within each split", () => {
    // 10 m every 5 s → 1 km split boundary at point 100.
    const track = makeTrack(210, 10, 5, () => ({ strokeRate: 60, hr: 150 }));
    const splits = aggregator.splits(track);

    expect(splits.length).toBeGreaterThanOrEqual(2);
    for (const s of splits) {
      expect(s.avgStrokeRate).toBe(60);
      expect(s.avgHr).toBe(150);
      expect(s.avgSpeedMps).toBeCloseTo(2, 1);
    }
  });

  it("reports 0 stroke rate / hr when the track has no samples", () => {
    const track = makeTrack(210, 10, 5);
    const splits = aggregator.splits(track);

    expect(splits.length).toBeGreaterThanOrEqual(2);
    for (const s of splits) {
      expect(s.avgStrokeRate).toBe(0);
      expect(s.avgHr).toBe(0);
    }
  });

  it("resets the stroke-rate accumulator at each split boundary", () => {
    // First km at 50 spm, second km at 70 spm.
    const track = makeTrack(210, 10, 5, (i) => ({ strokeRate: i <= 100 ? 50 : 70 }));
    const [first, second] = aggregator.splits(track);

    expect(first!.avgStrokeRate).toBe(50);
    expect(second!.avgStrokeRate).toBe(70);
  });
});

describe("aggregator.totals", () => {
  it("computes distance and average stroke rate from the whole track", () => {
    const track = makeTrack(101, 10, 5); // 1 km in 500 s
    const totals = aggregator.totals(track, 500);

    expect(totals.distanceMeters).toBeCloseTo(1000, -1);
    expect(totals.durationSec).toBe(500);
    expect(totals.avgStrokeRate).toBeCloseTo(60, 5); // 500 strokes / 500 s * 60
  });
});

describe("aggregator.totals GPS jump rejection", () => {
  // Regression: nothing filtered bad fixes. accuracyM was written onto the
  // track and then never read by anything, so a GPS jump was added to the
  // distance at face value. One Android paddle of under 7 miles reported 19.
  it("ignores a segment implying a speed no boat can reach", () => {
    // 2 m/s for 100 points = 990 m of real paddling.
    const track = makeTrack(100, 2, 1);
    const clean = aggregator.totals(track, 0);

    // Splice in one fix 2 km off course, then back, exactly as a bad fused
    // reading behaves: both jumps imply ~2000 m/s.
    const withJump = makeTrack(100, 2, 1);
    withJump[50] = { ...withJump[50]!, lat: withJump[50]!.lat + 2000 / 111_320 };
    const jumped = aggregator.totals(withJump, 0);

    // The 4 km round trip must not land in the total. What remains is the real
    // track minus the two segments that were discarded.
    expect(jumped.distanceMeters).toBeLessThan(clean.distanceMeters + 1);
    expect(jumped.distanceMeters).toBeGreaterThan(clean.distanceMeters - 10);
  });

  it("still counts genuine fast paddling", () => {
    // 6 m/s is a quick surfski, comfortably under the ceiling.
    const track = makeTrack(60, 6, 1);
    const t = aggregator.totals(track, 0);
    expect(t.distanceMeters).toBeGreaterThan(340);
  });

  it("does not report an impossible top speed from one bad reading", () => {
    const track = makeTrack(50, 2, 1);
    track[25] = { ...track[25]!, speedMps: 400 };
    expect(aggregator.totals(track, 0).maxSpeedMps).toBeLessThanOrEqual(12);
  });
});
