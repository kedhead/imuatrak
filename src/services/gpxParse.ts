/**
 * Pure GPX → TrackPoint parser. No native/Firebase imports so it can run
 * anywhere (and be tested under plain Node); the import-and-save flow that
 * needs the filesystem and auth lives in gpxImport.ts.
 *
 * Regex-based on purpose: GPX track points are flat, and vendor heart-rate
 * extensions vary wildly by namespace (gpxtpx:hr, ns3:hr, gpxdata:hr, …) —
 * an optionally-prefixed <hr> element covers them all without an XML DOM
 * dependency.
 */

import type { TrackPoint } from "@/models";
import { haversineMeters } from "./geo";

const TRKPT_RE = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/gi;
const LAT_RE = /\blat\s*=\s*["']([-\d.]+)["']/i;
const LON_RE = /\blon\s*=\s*["']([-\d.]+)["']/i;
const ELE_RE = /<(?:\w+:)?ele>([-\d.]+)<\/(?:\w+:)?ele>/i;
const TIME_RE = /<(?:\w+:)?time>([^<]+)<\/(?:\w+:)?time>/i;
const HR_RE = /<(?:\w+:)?hr>\s*(\d+)\s*<\/(?:\w+:)?hr>/i;
const NAME_RE = /<(?:\w+:)?name>([^<]*)<\/(?:\w+:)?name>/i;

// Implausible point-to-point speed (m/s) — treat as GPS glitch, clamp.
const MAX_SPEED_MPS = 12;

export interface ParsedGpx {
  points: TrackPoint[];
  startedAtMs: number;
  name?: string;
}

/** Parse GPX text into track points with t = seconds since first point. */
export function parseGpx(xml: string): ParsedGpx {
  const raw: { lat: number; lon: number; altM: number; timeMs: number; hr?: number }[] = [];

  for (const m of xml.matchAll(TRKPT_RE)) {
    const attrs = m[1] ?? "";
    const body = m[2] ?? "";
    const lat = Number(LAT_RE.exec(attrs)?.[1]);
    const lon = Number(LON_RE.exec(attrs)?.[1]);
    const timeStr = TIME_RE.exec(body)?.[1];
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !timeStr) continue;
    const timeMs = Date.parse(timeStr.trim());
    if (!Number.isFinite(timeMs)) continue;

    const ele = Number(ELE_RE.exec(body)?.[1]);
    const hrStr = HR_RE.exec(body)?.[1];
    raw.push({
      lat,
      lon,
      altM: Number.isFinite(ele) ? ele : 0,
      timeMs,
      hr: hrStr ? Number(hrStr) : undefined,
    });
  }

  if (raw.length < 2) {
    throw new Error(
      "No usable GPS track found in this file. Make sure it's a GPX export with location and timestamps.",
    );
  }

  // Some exports store points out of order or duplicate timestamps.
  raw.sort((a, b) => a.timeMs - b.timeMs);
  const startedAtMs = raw[0]!.timeMs;

  const points: TrackPoint[] = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i]!;
    let speedMps = 0;
    if (i > 0) {
      const prev = raw[i - 1]!;
      const dt = (p.timeMs - prev.timeMs) / 1000;
      if (dt > 0) {
        speedMps = Math.min(
          haversineMeters(prev.lat, prev.lon, p.lat, p.lon) / dt,
          MAX_SPEED_MPS,
        );
      }
    }
    points.push({
      t: (p.timeMs - startedAtMs) / 1000,
      lat: p.lat,
      lon: p.lon,
      altM: p.altM,
      speedMps,
      ...(p.hr != null ? { hr: p.hr } : {}),
    });
  }

  const name = NAME_RE.exec(xml)?.[1]?.trim();
  return { points, startedAtMs, name: name || undefined };
}
