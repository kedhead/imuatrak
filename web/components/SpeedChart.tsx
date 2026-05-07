"use client";

import type { TrackSummaryPoint } from "@/lib/types";

const W = 800;
const H = 100;
const PL = 40;
const PB = 20;
const PT = 8;
const PR = 8;
const IW = W - PL - PR;
const IH = H - PT - PB;

export default function SpeedChart({ points }: { points: TrackSummaryPoint[] }) {
  if (points.length < 2) return null;

  const speeds = points.map((p) => p.speedMps * 3.6);
  const maxSpeed = Math.max(...speeds, 0.1);
  const t0 = points[0]!.t;
  const tN = points[points.length - 1]!.t;
  const tRange = Math.max(tN - t0, 1);

  const cx = (t: number) => (PL + ((t - t0) / tRange) * IW).toFixed(1);
  const cy = (v: number) => (PT + IH - (v / maxSpeed) * IH).toFixed(1);

  const linePts = points.map((p) => `${cx(p.t)},${cy(p.speedMps * 3.6)}`).join(" ");
  const areaPts = [
    `${cx(t0)},${(PT + IH).toFixed(1)}`,
    ...points.map((p) => `${cx(p.t)},${cy(p.speedMps * 3.6)}`),
    `${cx(tN)},${(PT + IH).toFixed(1)}`,
  ].join(" ");

  const gridLines = [0.33, 0.67, 1].map((f) => ({
    y: (PT + IH - f * IH).toFixed(1),
    label: (maxSpeed * f).toFixed(1),
  }));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: 100, display: "block" }}
      aria-label="Speed over time"
    >
      <defs>
        <linearGradient id="spd-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {gridLines.map((g) => (
        <g key={g.label}>
          <line x1={PL} y1={g.y} x2={W - PR} y2={g.y} stroke="#1f242b" strokeWidth="1" />
          <text x={PL - 4} y={parseFloat(g.y) + 4} textAnchor="end" fontSize="10" fill="#8b95a3">
            {g.label}
          </text>
        </g>
      ))}
      <text x={PL - 4} y={PT + IH + 14} textAnchor="end" fontSize="10" fill="#8b95a3">
        km/h
      </text>
      <polygon points={areaPts} fill="url(#spd-fill)" />
      <polyline
        points={linePts}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
