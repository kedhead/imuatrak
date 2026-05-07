"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getUserSessions, setSessionPublic } from "@/lib/firebase";
import { formatDate, formatTime, formatDuration, formatKm, formatPace } from "@/lib/format";
import type { DashboardSession } from "@/lib/types";

const BASE_URL = "https://imuatrak.app";

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<DashboardSession[]>([]);
  const [fetching, setFetching] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    setFetching(true);
    getUserSessions(user.uid)
      .then(setSessions)
      .finally(() => setFetching(false));
  }, [user]);

  const handleToggle = async (session: DashboardSession) => {
    if (!user || toggling) return;
    const next = !session.isPublic;
    setToggling(session.id);
    // Optimistic update
    setSessions((prev) =>
      prev.map((s) => (s.id === session.id ? { ...s, isPublic: next } : s)),
    );
    try {
      await setSessionPublic(user.uid, session, next);
    } catch {
      // Revert on failure
      setSessions((prev) =>
        prev.map((s) => (s.id === session.id ? { ...s, isPublic: !next } : s)),
      );
    } finally {
      setToggling(null);
    }
  };

  const handleCopy = async (id: string) => {
    const url = `${BASE_URL}/s/${id}`;
    await navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading || !user) return null;

  return (
    <main className="container">
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 4px" }}>My Sessions</h1>
        <p style={{ color: "var(--muted)", margin: 0 }}>
          {user.displayName ?? user.email}
        </p>
      </div>

      {fetching ? (
        <div style={{ color: "var(--muted)", padding: "48px 0", textAlign: "center" }}>
          Loading…
        </div>
      ) : sessions.length === 0 ? (
        <div
          className="card"
          style={{ textAlign: "center", padding: "64px 24px", color: "var(--muted)" }}
        >
          <p style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)", margin: "0 0 8px" }}>
            No sessions yet
          </p>
          <p style={{ margin: 0 }}>
            Record your first paddle in the ImuaTrak app and it will appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              toggling={toggling === s.id}
              copied={copied === s.id}
              onToggle={() => void handleToggle(s)}
              onCopy={() => void handleCopy(s.id)}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function SessionRow({
  session: s,
  toggling,
  copied,
  onToggle,
  onCopy,
}: {
  session: DashboardSession;
  toggling: boolean;
  copied: boolean;
  onToggle: () => void;
  onCopy: () => void;
}) {
  return (
    <div
      className="card"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 16,
        alignItems: "center",
        padding: "16px 20px",
      }}
    >
      {/* Left: session info */}
      <Link
        href={`/dashboard/${s.id}`}
        style={{ textDecoration: "none", color: "inherit", minWidth: 0 }}
      >
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>
          {formatDate(s.startedAt)} · {formatTime(s.startedAt)}
        </div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
          {s.craftType} · {formatKm(s.totals.distanceMeters)} km
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--muted)", flexWrap: "wrap" }}>
          <span>{formatDuration(s.totals.durationSec)}</span>
          <span>{formatPace(s.totals.avgPaceSecPerKm)}</span>
          <span>{s.totals.strokeCount} strokes · {Math.round(s.totals.avgStrokeRate)} spm</span>
          {s.hr.avg > 0 && <span>{s.hr.avg} bpm avg</span>}
        </div>
      </Link>

      {/* Right: actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {/* Public toggle */}
        <button
          onClick={onToggle}
          disabled={toggling}
          title={s.isPublic ? "Make private" : "Make public"}
          style={{
            fontSize: 12,
            padding: "5px 12px",
            borderRadius: 8,
            border: "1px solid var(--line)",
            background: s.isPublic ? "rgba(59,130,246,0.15)" : "transparent",
            color: s.isPublic ? "var(--blue-bright)" : "var(--muted)",
            cursor: toggling ? "default" : "pointer",
            opacity: toggling ? 0.5 : 1,
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {s.isPublic ? "Public" : "Private"}
        </button>

        {/* Copy link — only when public */}
        {s.isPublic && (
          <button
            onClick={onCopy}
            title="Copy public link"
            style={{
              fontSize: 12,
              padding: "5px 12px",
              borderRadius: 8,
              border: "1px solid var(--line)",
              background: "transparent",
              color: copied ? "#22c55e" : "var(--muted)",
              cursor: "pointer",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
        )}
      </div>
    </div>
  );
}
