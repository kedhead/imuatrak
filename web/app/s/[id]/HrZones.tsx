import { formatDuration } from "@/lib/format";
import type { HrSummary } from "@/lib/types";

const ZONE_COLORS = ["#6b7785", "#22c55e", "#eab308", "#f97316", "#ef4444"];

export default function HrZones({ hr }: { hr: HrSummary }) {
  if (hr.avg === 0 || !hr.zones.length) return null;
  const total = hr.zones.reduce((s, z) => s + z.timeSec, 0);
  if (total === 0) return null;

  return (
    <section className="chart-section">
      <h2 className="chart-label">HR Zones</h2>

      {/* Stacked bar */}
      <div style={{ height: 16, borderRadius: 8, overflow: "hidden", display: "flex", gap: 2 }}>
        {hr.zones.map((z, i) =>
          z.timeSec > 0 ? (
            <div
              key={z.zone}
              title={`Z${z.zone}: ${z.minBpm}–${z.maxBpm === 999 ? `${z.minBpm}+` : z.maxBpm} bpm — ${formatDuration(z.timeSec)}`}
              style={{
                flex: z.timeSec,
                background: ZONE_COLORS[i],
                borderRadius: 4,
              }}
            />
          ) : null,
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
        {hr.zones
          .filter((z) => z.timeSec > 0)
          .map((z) => {
            const i = z.zone - 1;
            const maxLabel = z.maxBpm >= 999 ? `${z.minBpm}+` : `${z.maxBpm}`;
            return (
              <div
                key={z.zone}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: ZONE_COLORS[i],
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: "var(--muted)" }}>
                  Z{z.zone} {z.minBpm}–{maxLabel}
                </span>
                <span style={{ fontWeight: 600 }}>{formatDuration(z.timeSec)}</span>
              </div>
            );
          })}
      </div>
    </section>
  );
}
