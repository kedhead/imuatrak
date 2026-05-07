"use client";

import type { TrackSummaryPoint } from "@/lib/types";

const W = 800;
const H = 72;
const PL = 44;
const PB = 8;
const PT = 8;
const PR = 8;
const IW = W - PL - PR;
const IH = H - PT - PB;

export default function ElevChart({ points }: { points: TrackSummaryPoint[] }) {
  if (points.length < 2) return null;

  const alts = points.map((p) => p.altM);
  const minAlt = Math.min(...alts);
  const maxAlt = Math.max(...alts);
  const range = maxAlt - minAlt;

  if (maxAlt === 0 || range < 3) return null;

  const t0 = points[0]!.t;
  const tN = points[points.length - 1]!.t;
  const tRange = Math.max(tN - t0, 1);

  const cx = (t: number) => (PL + ((t - t0) / tRange) * IW).toFixed(1);
  const cy = (a: number) => (PT + IH - ((a - minAlt) / range) * IH).toFixed(1);

  const linePts = points.map((p) => `${cx(p.t)},${cy(p.altM)}`).join(" ");
  const areaPts = [
    `${cx(t0)},${(PT + IH).toFixed(1)}`,
    ...points.map((p) => `${cx(p.t)},${cy(p.altM)}`),
    `${cx(tN)},${(PT + IH).toFixed(1)}`,
  ].join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: 72, display: "block" }}
      aria-label="Elevation profile"
    >
      <defs>
        <linearGradient id="elev-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1fb6a6" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#1fb6a6" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <text x={PL - 4} y={PT + 8} textAnchor="end" fontSize="10" fill="#8b95a3">
        {maxAlt.toFixed(0)}m
      </text>
      <text x={PL - 4} y={PT + IH} textAnchor="end" fontSize="10" fill="#8b95a3">
        {minAlt.toFixed(0)}m
      </text>
      <polygon points={areaPts} fill="url(#elev-fill)" />
      <polyline
        points={linePts}
        fill="none"
        stroke="#1fb6a6"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
