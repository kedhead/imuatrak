import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicSession } from "@/lib/firebase";
import {
  formatDate,
  formatTime,
  formatDuration,
  formatKm,
  formatPace,
  formatSpeed,
} from "@/lib/format";
import SessionMap from "./SessionMap";
import SpeedChart from "./SpeedChart";
import ElevChart from "./ElevChart";
import HrZones from "./HrZones";
import ShareButton from "./ShareButton";

const BASE_URL = "https://imuatrak.app";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const s = await getPublicSession(id).catch(() => null);
  if (!s) return { title: "Session not found — ImuaTrak" };
  const title = `${s.craftType} · ${formatKm(s.totals.distanceMeters)} km · ${formatDuration(s.totals.durationSec)}`;
  return {
    title: `${title} — ImuaTrak`,
    description: `${formatDate(s.startedAt)} — paddling session shared via ImuaTrak.`,
    openGraph: {
      title,
      description: `${formatDate(s.startedAt)} — ${formatKm(s.totals.distanceMeters)} km in ${formatDuration(s.totals.durationSec)}`,
    },
  };
}

export default async function PublicSessionPage({ params }: Props) {
  const { id } = await params;
  const s = await getPublicSession(id);
  if (!s) notFound();

  const points = s.trackSummary.map((p) => [p.lat, p.lon] as [number, number]);
  const shareUrl = `${BASE_URL}/s/${id}`;
  const shareTitle = `${s.craftType} · ${formatKm(s.totals.distanceMeters)} km · ${formatDate(s.startedAt)}`;

  return (
    <main className="container">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 28,
        }}
      >
        <a href="/" style={{ fontWeight: 700, fontSize: 17, textDecoration: "none" }}>
          ImuaTrak
        </a>
        <ShareButton url={shareUrl} title={shareTitle} />
      </header>

      {/* ── Title ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <p
          style={{
            margin: "0 0 4px",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          {formatDate(s.startedAt)} · {formatTime(s.startedAt)}
        </p>
        <h1 style={{ fontSize: 36, margin: "0 0 4px", fontWeight: 800 }}>{s.craftType}</h1>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 16 }}>
          {formatKm(s.totals.distanceMeters)} km &nbsp;·&nbsp;
          {formatDuration(s.totals.durationSec)} &nbsp;·&nbsp;
          {formatPace(s.totals.avgPaceSecPerKm)}
        </p>
      </div>

      {/* ── Map ────────────────────────────────────────────────── */}
      <div
        style={{
          height: 420,
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid var(--line)",
          marginBottom: 20,
        }}
      >
        {points.length >= 2 ? (
          <SessionMap points={points} />
        ) : (
          <div
            style={{
              height: "100%",
              display: "grid",
              placeItems: "center",
              color: "var(--muted)",
            }}
          >
            No GPS track recorded
          </div>
        )}
      </div>

      {/* ── Stats grid ─────────────────────────────────────────── */}
      <section
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          marginBottom: 8,
        }}
      >
        <Stat label="Distance" value={`${formatKm(s.totals.distanceMeters)} km`} />
        <Stat label="Duration" value={formatDuration(s.totals.durationSec)} />
        <Stat label="Avg pace" value={formatPace(s.totals.avgPaceSecPerKm)} />
        <Stat
          label="Strokes"
          value={`${s.totals.strokeCount}`}
          sub={`avg ${Math.round(s.totals.avgStrokeRate)} spm`}
        />
        <Stat
          label="Avg HR"
          value={s.hr.avg > 0 ? `${s.hr.avg} bpm` : "—"}
          sub={s.hr.max > 0 ? `max ${s.hr.max}` : undefined}
        />
        <Stat label="Max speed" value={formatSpeed(s.totals.maxSpeedMps)} />
        <Stat label="Elev. gain" value={`${Math.round(s.totals.elevationGainM)} m`} />
        <Stat
          label="Moving time"
          value={formatDuration(s.totals.movingDurationSec || s.totals.durationSec)}
        />
        {s.totals.calories > 0 && (
          <Stat label="Calories" value={`${Math.round(s.totals.calories)} kcal`} />
        )}
      </section>

      {/* ── Speed chart ────────────────────────────────────────── */}
      {s.trackSummary.length >= 2 && (
        <section className="chart-section">
          <h2 className="chart-label">Speed</h2>
          <SpeedChart points={s.trackSummary} />
        </section>
      )}

      {/* ── Elevation chart ────────────────────────────────────── */}
      {s.trackSummary.length >= 2 && (
        <section className="chart-section">
          <h2 className="chart-label">Elevation</h2>
          <ElevChart points={s.trackSummary} />
        </section>
      )}

      {/* ── HR zones ───────────────────────────────────────────── */}
      <HrZones hr={s.hr} />

      {/* ── Splits table ───────────────────────────────────────── */}
      {s.splits.length > 0 && (
        <section className="chart-section">
          <h2 className="chart-label">Splits</h2>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                  <th style={th}>#</th>
                  <th style={th}>Time</th>
                  <th style={th}>Pace</th>
                  <th style={th}>Stroke rate</th>
                  <th style={th}>HR</th>
                </tr>
              </thead>
              <tbody>
                {s.splits.map((sp) => (
                  <tr key={sp.index} style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={td}>{sp.index + 1}</td>
                    <td style={td}>{formatDuration(sp.durationSec)}</td>
                    <td style={td}>{formatPace(sp.durationSec / (sp.distanceM / 1000))}</td>
                    <td style={td}>{Math.round(sp.avgStrokeRate)} spm</td>
                    <td style={td}>{sp.avgHr > 0 ? `${Math.round(sp.avgHr)} bpm` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer
        style={{
          marginTop: 48,
          paddingTop: 24,
          borderTop: "1px solid var(--line)",
          color: "var(--muted)",
          fontSize: 13,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <span>
          Recorded with{" "}
          <a href="/" style={{ color: "var(--blue-bright)" }}>
            ImuaTrak
          </a>
        </span>
        <ShareButton url={shareUrl} title={shareTitle} />
      </footer>
    </main>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card">
      <div
        style={{
          color: "var(--muted)",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 1,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "12px 16px",
  fontWeight: 600,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 1,
};
const td: React.CSSProperties = { padding: "12px 16px" };
