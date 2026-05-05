import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicSession } from "@/lib/firebase";
import { formatDate, formatDuration, formatKm, formatPace } from "@/lib/format";
import SessionMap from "./SessionMap";

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
    openGraph: { title, description: formatDate(s.startedAt) },
  };
}

export default async function PublicSessionPage({ params }: Props) {
  const { id } = await params;
  const s = await getPublicSession(id);
  if (!s) notFound();

  const points = s.trackSummary.map((p) => [p.lat, p.lon] as [number, number]);

  return (
    <main className="container">
      <header style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <a href="/" style={{ fontWeight: 700, textDecoration: "none" }}>ImuaTrak</a>
        <span className="muted" style={{ fontSize: 13 }}>{formatDate(s.startedAt)}</span>
      </header>

      <h1 style={{ fontSize: 32, margin: "0 0 4px" }}>{s.craftType}</h1>
      <p className="muted" style={{ margin: 0 }}>
        {formatKm(s.totals.distanceMeters)} km · {formatDuration(s.totals.durationSec)} ·
        {" "}{formatPace(s.totals.avgPaceSecPerKm)}
      </p>

      <div style={{ height: 380, borderRadius: 16, overflow: "hidden", marginTop: 24, border: "1px solid var(--line)" }}>
        {points.length >= 2 ? (
          <SessionMap points={points} />
        ) : (
          <div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--muted)" }}>
            No GPS track recorded
          </div>
        )}
      </div>

      <section style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginTop: 24 }}>
        <Stat label="Distance" value={`${formatKm(s.totals.distanceMeters)} km`} />
        <Stat label="Duration" value={formatDuration(s.totals.durationSec)} />
        <Stat label="Avg pace" value={formatPace(s.totals.avgPaceSecPerKm)} />
        <Stat
          label="Strokes"
          value={`${s.totals.strokeCount} · ${Math.round(s.totals.avgStrokeRate)} spm`}
        />
        <Stat label="Avg HR" value={s.hr.avg > 0 ? `${s.hr.avg} bpm` : "—"} />
        <Stat label="Elev. gain" value={`${Math.round(s.totals.elevationGainM)} m`} />
      </section>

      {s.splits.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 14, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase", margin: "0 0 12px" }}>
            Splits
          </h2>
          <div className="card" style={{ padding: 0 }}>
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

      <footer style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid var(--line)", color: "var(--muted)", fontSize: 13, textAlign: "center" }}>
        Recorded with <a href="/" style={{ color: "var(--blue-bright)" }}>ImuaTrak</a>
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div style={{ color: "var(--muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "12px 16px", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 };
const td: React.CSSProperties = { padding: "12px 16px" };
