"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getUserSession, setSessionPublic } from "@/lib/firebase";
import {
  formatDate,
  formatTime,
  formatDuration,
  formatKm,
  formatPace,
  formatSpeed,
} from "@/lib/format";
import type { DashboardSession } from "@/lib/types";
import SessionMap from "@/components/SessionMap";
import SpeedChart from "@/components/SpeedChart";
import ElevChart from "@/components/ElevChart";
import HrZones from "@/components/HrZones";

const BASE_URL = "https://imuatrak.app";

export default function DashboardSessionPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<DashboardSession | null>(null);
  const [fetching, setFetching] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !id) return;
    getUserSession(user.uid, id)
      .then(setSession)
      .finally(() => setFetching(false));
  }, [user, id]);

  const handleToggle = async () => {
    if (!user || !session || toggling) return;
    const next = !session.isPublic;
    setToggling(true);
    setSession((s) => s && { ...s, isPublic: next });
    try {
      await setSessionPublic(user.uid, session, next);
    } catch {
      setSession((s) => s && { ...s, isPublic: !next });
    } finally {
      setToggling(false);
    }
  };

  const handleCopy = async () => {
    if (!session) return;
    await navigator.clipboard.writeText(`${BASE_URL}/s/${session.id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  if (loading || !user) return null;

  if (fetching) {
    return (
      <main className="container">
        <div style={{ color: "var(--muted)", padding: "80px 0", textAlign: "center" }}>
          Loading…
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="container">
        <p style={{ color: "var(--muted)" }}>Session not found.</p>
        <Link href="/dashboard" style={{ color: "var(--blue-bright)" }}>
          ← Back to dashboard
        </Link>
      </main>
    );
  }

  const points = session.trackSummary.map((p) => [p.lat, p.lon] as [number, number]);

  return (
    <main className="container">
      {/* Back link */}
      <Link
        href="/dashboard"
        style={{ color: "var(--muted)", fontSize: 14, textDecoration: "none", display: "inline-block", marginBottom: 20 }}
      >
        ← My Sessions
      </Link>

      {/* Title row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)" }}>
            {formatDate(session.startedAt)} · {formatTime(session.startedAt)}
          </p>
          <h1 style={{ fontSize: 36, margin: "0 0 4px", fontWeight: 800 }}>{session.craftType}</h1>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 16 }}>
            {formatKm(session.totals.distanceMeters)} km &nbsp;·&nbsp;
            {formatDuration(session.totals.durationSec)} &nbsp;·&nbsp;
            {formatPace(session.totals.avgPaceSecPerKm)}
          </p>
        </div>

        {/* Sharing controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={handleToggle}
            disabled={toggling}
            style={{
              fontSize: 13,
              padding: "8px 16px",
              borderRadius: 10,
              border: "1px solid var(--line)",
              background: session.isPublic ? "rgba(59,130,246,0.15)" : "transparent",
              color: session.isPublic ? "var(--blue-bright)" : "var(--muted)",
              cursor: toggling ? "default" : "pointer",
              opacity: toggling ? 0.6 : 1,
              fontWeight: 600,
            }}
          >
            {session.isPublic ? "Public" : "Private"}
          </button>
          {session.isPublic && (
            <>
              <button
                onClick={handleCopy}
                style={{
                  fontSize: 13,
                  padding: "8px 16px",
                  borderRadius: 10,
                  border: "1px solid var(--line)",
                  background: "transparent",
                  color: copied ? "#22c55e" : "var(--muted)",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {copied ? "Copied!" : "Copy link"}
              </button>
              <Link
                href={`/s/${session.id}`}
                target="_blank"
                className="btn"
                style={{ fontSize: 13, padding: "8px 16px" }}
              >
                Public page ↗
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Map */}
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
          <div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--muted)" }}>
            No GPS track recorded
          </div>
        )}
      </div>

      {/* Stats */}
      <section
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          marginBottom: 8,
        }}
      >
        <Stat label="Distance" value={`${formatKm(session.totals.distanceMeters)} km`} />
        <Stat label="Duration" value={formatDuration(session.totals.durationSec)} />
        <Stat label="Avg pace" value={formatPace(session.totals.avgPaceSecPerKm)} />
        <Stat
          label="Strokes"
          value={`${session.totals.strokeCount}`}
          sub={`avg ${Math.round(session.totals.avgStrokeRate)} spm`}
        />
        <Stat
          label="Avg HR"
          value={session.hr.avg > 0 ? `${session.hr.avg} bpm` : "—"}
          sub={session.hr.max > 0 ? `max ${session.hr.max}` : undefined}
        />
        <Stat label="Max speed" value={formatSpeed(session.totals.maxSpeedMps)} />
        <Stat label="Elev. gain" value={`${Math.round(session.totals.elevationGainM)} m`} />
        <Stat
          label="Moving time"
          value={formatDuration(session.totals.movingDurationSec || session.totals.durationSec)}
        />
        {session.totals.calories > 0 && (
          <Stat label="Calories" value={`${Math.round(session.totals.calories)} kcal`} />
        )}
      </section>

      {/* Speed chart */}
      {session.trackSummary.length >= 2 && (
        <section className="chart-section">
          <h2 className="chart-label">Speed</h2>
          <SpeedChart points={session.trackSummary} />
        </section>
      )}

      {/* Elevation chart */}
      {session.trackSummary.length >= 2 && (
        <section className="chart-section">
          <h2 className="chart-label">Elevation</h2>
          <ElevChart points={session.trackSummary} />
        </section>
      )}

      {/* HR zones */}
      <HrZones hr={session.hr} />

      {/* Splits */}
      {session.splits.length > 0 && (
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
                {session.splits.map((sp) => (
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
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const th: React.CSSProperties = { padding: "12px 16px", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 };
const td: React.CSSProperties = { padding: "12px 16px" };
