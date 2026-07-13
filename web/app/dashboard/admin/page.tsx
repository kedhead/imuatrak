"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { fetchAppStats, isAppAdmin, type AppStats } from "@/lib/firebase";

export default function AdminAnalyticsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [stats, setStats] = useState<AppStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const ok = await isAppAdmin(user.uid);
      if (cancelled) return;
      setAdmin(ok);
      if (!ok) return;
      try {
        setStats(await fetchAppStats());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load stats");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || !user) return null;

  if (admin === false) {
    return (
      <main className="container">
        <div className="card" style={{ textAlign: "center", padding: "64px 24px", color: "var(--muted)" }}>
          <p style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)", margin: "0 0 8px" }}>
            Admins only
          </p>
          <p style={{ margin: 0 }}>This page shows app-wide usage stats and isn&apos;t available for your account.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 4px" }}>App Analytics</h1>
        <p style={{ color: "var(--muted)", margin: 0 }}>
          {stats
            ? `Live from Firebase · updated ${new Date(stats.generatedAt).toLocaleString()}`
            : "App-wide usage across all accounts"}
        </p>
      </div>

      {error ? (
        <div className="card" style={{ padding: "32px 24px", color: "var(--muted)" }}>
          <p style={{ fontWeight: 600, color: "var(--ink)", margin: "0 0 8px" }}>Couldn&apos;t load stats</p>
          <p style={{ margin: 0, fontSize: 14 }}>{error}</p>
        </div>
      ) : !stats ? (
        <div style={{ color: "var(--muted)", padding: "48px 0", textAlign: "center" }}>Loading…</div>
      ) : (
        <>
          <section style={tileGrid}>
            <StatTile label="Total users" value={stats.totalUsers} />
            <StatTile label="Active users, 7 days" value={stats.activeUsers7} hint="paddled at least once" />
            <StatTile label="Active users, 30 days" value={stats.activeUsers30} hint="paddled at least once" />
            <StatTile label="New users, 7 days" value={stats.newUsers7} />
            <StatTile label="Sessions, all time" value={stats.totalSessions} />
            <StatTile label="Sessions, 7 days" value={stats.sessions7} />
            <StatTile label="Clubs" value={stats.clubs} />
            <StatTile label="Public sessions" value={stats.publicSessions} />
          </section>

          <DailyBarChart title="Sessions recorded per day — last 30 days" data={stats.sessionsByDay} />
          <DailyBarChart title="New signups per day — last 30 days" data={stats.signupsByDay} />

          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 20 }}>
            Users come from Firebase Auth; sessions, clubs and public sessions from Firestore.
            &ldquo;Active&rdquo; means the account recorded at least one session in the window.
          </p>
        </>
      )}
    </main>
  );
}

const tileGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
  gap: 10,
  marginBottom: 24,
};

function StatTile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{value.toLocaleString()}</div>
      {hint && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

/**
 * Single-series bar chart over the last 30 calendar days (UTC), zero-filling
 * days absent from the data. Pure SVG — hover a bar for the exact value.
 */
function DailyBarChart({ title, data }: { title: string; data: Record<string, number> }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const days = useMemo(() => {
    const out: { date: string; count: number }[] = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      out.push({ date: key, count: data[key] ?? 0 });
    }
    return out;
  }, [data]);

  const max = Math.max(1, ...days.map((d) => d.count));

  const W = 900;
  const H = 220;
  const PAD_LEFT = 30;
  const PAD_BOTTOM = 24;
  const PAD_TOP = 14;
  const plotW = W - PAD_LEFT - 8;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const step = plotW / days.length;
  const barW = Math.max(4, step - 4);

  const yTicks = [max, Math.round(max / 2)].filter((v, i, a) => v > 0 && a.indexOf(v) === i);

  const shortDate = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  };

  return (
    <div className="card" style={{ padding: "18px 20px", marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, minHeight: 16 }}>
        {hovered !== null
          ? `${shortDate(days[hovered]!.date)} — ${days[hovered]!.count.toLocaleString()}`
          : " "}
      </div>
      <div style={{ overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", minWidth: 480, display: "block" }}
          role="img"
          aria-label={title}
          onMouseLeave={() => setHovered(null)}
        >
          {/* gridlines + y labels */}
          {yTicks.map((v) => {
            const y = PAD_TOP + plotH - (v / max) * plotH;
            return (
              <g key={v}>
                <line x1={PAD_LEFT} x2={W - 8} y1={y} y2={y} stroke="var(--line)" strokeWidth={1} />
                <text x={PAD_LEFT - 6} y={y + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
                  {v}
                </text>
              </g>
            );
          })}
          <line
            x1={PAD_LEFT} x2={W - 8}
            y1={PAD_TOP + plotH} y2={PAD_TOP + plotH}
            stroke="var(--line)" strokeWidth={1}
          />

          {days.map((d, i) => {
            const h = (d.count / max) * plotH;
            const x = PAD_LEFT + i * step + (step - barW) / 2;
            const y = PAD_TOP + plotH - h;
            const isHovered = hovered === i;
            return (
              <g key={d.date} onMouseEnter={() => setHovered(i)}>
                {/* full-height hit target so hovering the gap still works */}
                <rect x={PAD_LEFT + i * step} y={PAD_TOP} width={step} height={plotH} fill="transparent" />
                {d.count > 0 && (
                  <path
                    d={roundedTopBar(x, y, barW, h, Math.min(4, barW / 2, h))}
                    fill={isHovered ? "var(--blue-bright)" : "var(--blue)"}
                  />
                )}
                {/* sparse x labels: today and every 7th day counting back */}
                {(days.length - 1 - i) % 7 === 0 && (
                  <text
                    x={PAD_LEFT + i * step + step / 2}
                    y={H - 6}
                    textAnchor="middle"
                    fontSize={11}
                    fill="var(--muted)"
                  >
                    {shortDate(d.date)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/** Bar anchored flat to the baseline with rounded top corners. */
function roundedTopBar(x: number, y: number, w: number, h: number, r: number) {
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + w - r} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `L ${x + w} ${y + h}`,
    "Z",
  ].join(" ");
}
