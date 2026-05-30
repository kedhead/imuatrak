"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { getUserClub } from "@/lib/firebase";
import type { Club } from "@/lib/clubTypes";
import type { MemberRole } from "@/lib/clubTypes";

interface ClubCtx { club: Club; role: MemberRole }

export default function ClubDashboard() {
  const { user, loading } = useAuth();
  const [ctx, setCtx] = useState<ClubCtx | null | "none">(null);

  useEffect(() => {
    if (!user) return;
    getUserClub(user.uid).then((r) => setCtx(r ?? "none"));
  }, [user]);

  if (loading || ctx === null) return <div className="container"><p style={{ color: "var(--muted)" }}>Loading…</p></div>;
  if (!user) return <div className="container"><p>Please <Link href="/login" style={{ color: "var(--blue-bright)" }}>sign in</Link>.</p></div>;
  if (ctx === "none") return <NoClub />;

  const { club, role } = ctx;
  const isAdmin = role === "owner" || role === "admin";
  const subColor = club.subscriptionStatus === "active" ? "var(--teal)" : club.subscriptionStatus === "trial" ? "var(--blue-bright)" : "#ef4444";

  return (
    <main className="container">
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", gap: 20 }}>
        {club.logoUrl && (
          <img
            src={club.logoUrl}
            alt={`${club.name} logo`}
            style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--line)", flexShrink: 0, marginTop: 4 }}
          />
        )}
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)" }}>
            Club Dashboard · <span style={{ textTransform: "capitalize" }}>{role}</span>
          </p>
          <h1 style={{ margin: "0 0 4px", fontSize: 32, fontWeight: 800 }}>{club.name}</h1>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            {club.location.city}{club.location.country ? `, ${club.location.country}` : ""}
          </p>
          {club.websiteUrl && (
            <a
              href={club.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6, fontSize: 13, color: "var(--blue-bright)", textDecoration: "none", fontWeight: 600 }}
            >
              🌐 {club.websiteUrl.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
      </div>

      {/* Subscription banner */}
      <div className="card" style={{ marginBottom: 20, borderLeft: `4px solid ${subColor}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, color: subColor, textTransform: "capitalize" }}>{club.subscriptionStatus}</div>
          {club.subscriptionStatus === "trial" && club.trialEndsAt && (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Trial ends {new Date(club.trialEndsAt).toLocaleDateString()}</div>
          )}
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>{club.memberCount} member{club.memberCount !== 1 ? "s" : ""}</div>
      </div>

      {/* Quick-nav grid */}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 32 }}>
        <NavCard href="/dashboard/club/members" label="Members" icon="👥" desc={`${club.memberCount} member${club.memberCount !== 1 ? "s" : ""}`} />
        <NavCard href="/dashboard/club/events" label="Events" icon="📅" desc="Schedule & manage" />
        <NavCard href="/dashboard/club/posts" label="News Feed" icon="📣" desc="Announcements & posts" />
        {isAdmin && <NavCard href="/dashboard/club/settings" label="Settings" icon="⚙️" desc="Edit club & billing" />}
      </div>

      {club.description && (
        <div className="card">
          <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>About</h2>
          <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.6 }}>{club.description}</p>
        </div>
      )}
    </main>
  );
}

function NavCard({ href, label, icon, desc }: { href: string; label: string; icon: string; desc: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div className="card" style={{ cursor: "pointer", transition: "opacity .15s" }} onMouseEnter={e => (e.currentTarget.style.opacity = ".8")} onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>{desc}</div>
      </div>
    </Link>
  );
}

function NoClub() {
  return (
    <main className="container">
      <div className="card" style={{ textAlign: "center", padding: 48 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏝️</div>
        <h2 style={{ margin: "0 0 8px" }}>No club yet</h2>
        <p style={{ color: "var(--muted)", marginBottom: 24 }}>Create or join a club from the mobile app to manage it here.</p>
        <Link href="/dashboard" style={{ color: "var(--blue-bright)" }}>← Back to sessions</Link>
      </div>
    </main>
  );
}
