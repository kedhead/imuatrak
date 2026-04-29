import {
  emptyHr,
  emptyTotals,
  type HrSummary,
  type Split,
  type Totals,
  type TrackPoint,
} from "@/models";
import { haversineMeters } from "./geo";

const DEFAULT_ZONE_BOUNDS = [0, 120, 140, 160, 175, 1000];

export function totals(points: TrackPoint[], strokeCount: number): Totals {
  if (points.length < 2) return { ...emptyTotals(), strokeCount };

  let dist = 0;
  let maxSpeed = 0;
  let elevGain = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    dist += haversineMeters(a.lat, a.lon, b.lat, b.lon);
    if (b.speedMps > maxSpeed) maxSpeed = b.speedMps;
    const rise = b.altM - a.altM;
    if (rise > 0) elevGain += rise;
  }
  const durationSec = points[points.length - 1]!.t - points[0]!.t;

  let movingSec = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (b.speedMps > 0.5 || haversineMeters(a.lat, a.lon, b.lat, b.lon) > 0.5) {
      movingSec += b.t - a.t;
    }
  }

  const avgSpeed = durationSec > 0 ? dist / durationSec : 0;
  return {
    distanceMeters: dist,
    durationSec,
    movingDurationSec: movingSec,
    avgPaceSecPerKm: avgSpeed > 0 ? 1000 / avgSpeed : 0,
    avgSpeedMps: avgSpeed,
    maxSpeedMps: maxSpeed,
    strokeCount,
    avgStrokeRate: durationSec > 0 ? (strokeCount * 60) / durationSec : 0,
    calories: 0,
    elevationGainM: elevGain,
  };
}

export function splits(points: TrackPoint[], imperial = false): Split[] {
  if (points.length < 2) return [];
  const unit = imperial ? 1609.344 : 1000;
  const out: Split[] = [];
  let splitDist = 0;
  let splitStartT = points[0]!.t;
  let splitHrSum = 0;
  let splitHrSamples = 0;
  let idx = 1;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    splitDist += haversineMeters(a.lat, a.lon, b.lat, b.lon);
    if (b.hr != null) {
      splitHrSum += b.hr;
      splitHrSamples += 1;
    }
    if (splitDist >= unit) {
      const dur = b.t - splitStartT;
      out.push({
        index: idx++,
        distanceM: unit,
        durationSec: dur,
        avgHr: splitHrSamples > 0 ? Math.round(splitHrSum / splitHrSamples) : 0,
        avgStrokeRate: 0,
        avgSpeedMps: dur > 0 ? unit / dur : 0,
      });
      splitDist = 0;
      splitStartT = b.t;
      splitHrSum = 0;
      splitHrSamples = 0;
    }
  }
  return out;
}

export function hrSummary(points: TrackPoint[], zoneBounds = DEFAULT_ZONE_BOUNDS): HrSummary {
  if (zoneBounds.length !== 6) throw new Error("zoneBounds must have length 6");
  const hrs = points.map((p) => p.hr).filter((x): x is number => x != null);
  if (hrs.length === 0) return emptyHr();

  const zoneTimes = [0, 0, 0, 0, 0];
  for (let i = 1; i < points.length; i++) {
    const hr = points[i]!.hr;
    if (hr == null) continue;
    const dt = points[i]!.t - points[i - 1]!.t;
    let z = 0;
    for (let k = 0; k < zoneBounds.length; k++) {
      if (hr >= zoneBounds[k]!) z = k;
    }
    z = Math.max(0, Math.min(4, z));
    zoneTimes[z]! += dt;
  }
  const avg = Math.round(hrs.reduce((s, h) => s + h, 0) / hrs.length);
  const max = hrs.reduce((m, h) => (h > m ? h : m), 0);
  return {
    avg,
    max,
    zones: [0, 1, 2, 3, 4].map((i) => ({
      zone: i + 1,
      minBpm: zoneBounds[i]!,
      maxBpm: zoneBounds[i + 1]! - 1,
      timeSec: zoneTimes[i]!,
    })),
  };
}
