"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { getUserClub, getClubMembers, updateMemberRole, removeClubMember } from "@/lib/firebase";
import type { ClubMember, MemberRole } from "@/lib/clubTypes";

const ROLES: MemberRole[] = ["owner", "admin", "coach", "member"];
const ROLE_ORDER: Record<MemberRole, number> = { owner: 0, admin: 1, coach: 2, member: 3 };

export default function MembersPage() {
  const { user, loading } = useAuth();
  const [clubId, setClubId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<MemberRole | null>(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getUserClub(user.uid).then((ctx) => {
      if (!ctx) return;
      setClubId(ctx.club.id);
      setMyRole(ctx.role);
      getClubMembers(ctx.club.id).then((m) =>
        setMembers(m.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])),
      );
    });
  }, [user]);

  const isAdmin = myRole === "owner" || myRole === "admin";

  const handleRoleChange = async (uid: string, role: MemberRole) => {
    if (!clubId) return;
    setBusy(uid);
    await updateMemberRole(clubId, uid, role);
    setMembers((prev) =>
      prev.map((m) => (m.uid === uid ? { ...m, role } : m))
        .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]),
    );
    setBusy(null);
  };

  const handleRemove = async (uid: string, name: string) => {
    if (!clubId || !confirm(`Remove ${name} from the club?`)) return;
    setBusy(uid);
    await removeClubMember(clubId, uid);
    setMembers((prev) => prev.filter((m) => m.uid !== uid));
    setBusy(null);
  };

  if (loading) return <div className="container"><p style={{ color: "var(--muted)" }}>Loading…</p></div>;

  return (
    <main className="container">
      <div style={{ marginBottom: 24 }}>
        <Link href="/dashboard/club" style={{ color: "var(--muted)", fontSize: 13 }}>← Club Dashboard</Link>
        <h1 style={{ margin: "8px 0 0", fontSize: 28, fontWeight: 800 }}>Members</h1>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ color: "var(--muted)", textAlign: "left", borderBottom: "1px solid var(--line)" }}>
              <th style={th}>Name</th>
              <th style={th}>Role</th>
              <th style={th}>Joined</th>
              {isAdmin && <th style={th}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.uid} style={{ borderTop: "1px solid var(--line)" }}>
                <td style={td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 16, background: "var(--blue-bright)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                      {m.displayName.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 600 }}>{m.displayName}</span>
                    {m.uid === user?.uid && <span style={{ fontSize: 11, background: "#EBF3FB", color: "var(--blue-bright)", borderRadius: 8, padding: "2px 7px", fontWeight: 700 }}>You</span>}
                  </div>
                </td>
                <td style={td}>
                  {isAdmin && m.uid !== user?.uid ? (
                    <select
                      value={m.role}
                      disabled={busy === m.uid || m.role === "owner"}
                      onChange={(e) => handleRoleChange(m.uid, e.target.value as MemberRole)}
                      style={{ fontSize: 13, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--bg)", cursor: "pointer" }}
                    >
                      {ROLES.filter((r) => r !== "owner").map((r) => (
                        <option key={r} value={r} style={{ textTransform: "capitalize" }}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ textTransform: "capitalize", color: "var(--muted)" }}>{m.role}</span>
                  )}
                </td>
                <td style={{ ...td, color: "var(--muted)" }}>{new Date(m.joinedAt).toLocaleDateString()}</td>
                {isAdmin && (
                  <td style={td}>
                    {m.uid !== user?.uid && m.role !== "owner" && (
                      <button
                        onClick={() => handleRemove(m.uid, m.displayName)}
                        disabled={busy === m.uid}
                        style={{ fontSize: 12, color: "#ef4444", background: "none", border: "1px solid #ef4444", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

const th: React.CSSProperties = { padding: "12px 16px", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 };
const td: React.CSSProperties = { padding: "12px 16px" };
