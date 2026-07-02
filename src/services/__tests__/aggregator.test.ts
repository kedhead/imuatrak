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
