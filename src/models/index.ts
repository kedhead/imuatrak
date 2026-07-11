/**
 * Canonical session schema. Mirrors `docs/data-model.md` exactly. Anything
 * that goes to disk, Firestore, or a watch handoff must conform to these
 * types.
 */

export const SCHEMA_VERSION = 1;

export type CraftType =
  | "OC1"
  | "OC2"
  | "OC6"
  | "V1"
  | "SUP"
  | "SURFSKI"
  | "DB10"
  | "DB20"
  | "OTHER";

export const CRAFT_TYPES: readonly CraftType[] = [
  "OC1",
  "OC2",
  "OC6",
  "V1",
  "SUP",
  "SURFSKI",
  "DB10",
  "DB20",
  "OTHER",
] as const;

export type SessionSource = "ios-phone" | "ios-watch" | "android-phone" | "android-wear";

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

export interface HrZone {
  zone: number;
  minBpm: number;
  maxBpm: number;
  timeSec: number;
}

export interface HrSummary {
  avg: number;
  max: number;
  zones: HrZone[];
}

export interface Split {
  index: number;
  distanceM: number;
  durationSec: number;
  avgHr: number;
  avgStrokeRate: number;
  avgSpeedMps: number;
}

export interface SideSwitch {
  tSec: number;
  detectedSide: "L" | "R";
  confidence: number;
  source: "audio" | "manual";
}

export interface WeatherSample {
  tSec: number;
  windMps: number;
  windDeg: number;
  gustMps: number;
  airTempC: number;
  pressureHpa: number;
  conditions?: string;
}

export interface WeatherSummary {
  start: WeatherSample;
  end?: WeatherSample;
  samples: WeatherSample[];
}

export interface TrackSummaryPoint {
  t: number;
  lat: number;
  lon: number;
  altM: number;
  speedMps: number;
}

export interface TrackPoint {
  t: number;
  lat: number;
  lon: number;
  altM: number;
  speedMps: number;
  hr?: number;
  strokeRate?: number;
  cadenceConfidence?: number;
}

export interface Session {
  id: string;
  userId: string;
  schemaVersion: number;
  source: SessionSource;
  appVersion: string;
  craftType: CraftType;
  startedAt: string; // ISO-8601
  endedAt: string;
  totals: Totals;
  hr: HrSummary;
  splits: Split[];
  sideSwitches: SideSwitch[];
  weather?: WeatherSummary;
  trackSummary: TrackSummaryPoint[];
  trackStoragePath?: string;
  fitStoragePath?: string;
  cardStoragePath?: string;
  /**
   * When true, anyone with the session URL can view it on the web.
   * Defaults to false; flipped via the in-app Share toggle.
   */
  isPublic?: boolean;
}

export const emptyTotals = (): Totals => ({
  distanceMeters: 0,
  durationSec: 0,
  movingDurationSec: 0,
  avgPaceSecPerKm: 0,
  avgSpeedMps: 0,
  maxSpeedMps: 0,
  strokeCount: 0,
  avgStrokeRate: 0,
  calories: 0,
  elevationGainM: 0,
});

export const emptyHr = (): HrSummary => ({ avg: 0, max: 0, zones: [] });
