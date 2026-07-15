/**
 * GPX import — brings workouts recorded on third-party watches (Garmin,
 * Suunto, Polar, Coros, …) into ImuaTrak as regular sessions.
 *
 * Parsing lives in gpxParse.ts (pure, no native deps). This module derives
 * totals/splits/HR with the same aggregator used for live recordings, saves
 * the session locally, and best-effort syncs it to Firebase.
 */

import Constants from "expo-constants";

import { SCHEMA_VERSION, type CraftType, type Session } from "@/models";

import * as aggregator from "./aggregator";
import { auth } from "./firebase";
import { downsample } from "./geo";
import { parseGpx } from "./gpxParse";
import * as storage from "./storage";
import { syncSession } from "./sync";

export interface GpxImportResult {
  session: Session;
  pointCount: number;
}

/**
 * Parse GPX text, build a full Session, persist it locally, and best-effort
 * sync to Firebase. Stroke data isn't present in GPX, so strokeCount is 0.
 */
export async function importGpx(
  xml: string,
  opts: { craftType: CraftType; weightKg: number },
): Promise<GpxImportResult> {
  const { points, startedAtMs } = parseGpx(xml);

  const totals = aggregator.totals(points, 0, opts.weightKg);
  const splits = aggregator.splits(points);
  const hr = aggregator.hrSummary(points);
  const summary = downsample(points, 200).map((p) => ({
    t: p.t,
    lat: p.lat,
    lon: p.lon,
    altM: p.altM,
    speedMps: p.speedMps,
  }));

  const last = points[points.length - 1]!;
  const session: Session = {
    id: importId(),
    userId: auth.currentUser?.uid ?? "anonymous",
    schemaVersion: SCHEMA_VERSION,
    source: "gpx-import",
    appVersion: (Constants.expoConfig?.version as string) ?? "0.1.0",
    craftType: opts.craftType,
    startedAt: new Date(startedAtMs).toISOString(),
    endedAt: new Date(startedAtMs + last.t * 1000).toISOString(),
    totals,
    hr,
    splits,
    sideSwitches: [],
    trackSummary: summary,
  };

  await storage.save(session, points);
  if (auth.currentUser) {
    void syncSession(session).catch(() => undefined);
  }

  return { session, pointCount: points.length };
}

function importId(): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 16; i++) out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  return `${Date.now().toString(36)}-${out}`;
}
