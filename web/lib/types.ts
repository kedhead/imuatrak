/**
 * Web-side mirror of the Session schema. Must stay in sync with
 * `../src/models/index.ts` and `docs/data-model.md`. We duplicate (rather
 * than import across the project root) so this Next.js project compiles
 * without monorepo plumbing.
 */

export type CraftType = "OC1" | "OC2" | "OC6" | "V1" | "SUP" | "SURFSKI" | "OTHER";

export interface Totals {
  distanceMeters: number;
  durationSec: number;
  movingDurationSec: number;
  avgPaceSecPerKm: number;
  avgSpeedMps: number;
  maxSpeedMps: number;
  strokeCount: number;
  avgStrokeRate: number;
  calories: number;
  elevationGainM: number;
}

export interface HrSummary {
  avg: number;
  max: number;
  zones: { zone: number; minBpm: number; maxBpm: number; timeSec: number }[];
}

export interface Split {
  index: number;
  distanceM: number;
  durationSec: number;
  avgHr: number;
  avgStrokeRate: number;
  avgSpeedMps: number;
}

export interface TrackSummaryPoint {
  t: number;
  lat: number;
  lon: number;
  altM: number;
  speedMps: number;
}

export interface PublicSession {
  id: string;
  userId: string;
  source: string;
  craftType: CraftType;
  startedAt: string;
  endedAt: string;
  totals: Totals;
  hr: HrSummary;
  splits: Split[];
  trackSummary: TrackSummaryPoint[];
  isPublic: true;
}
