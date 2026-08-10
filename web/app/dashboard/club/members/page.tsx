"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/lib/auth";
import { getUserClub, getClubMembers, openDmThread, updateMemberRole, removeClubMember } from "@/lib/firebase";
import type { ClubMember, MemberRole } from "@/lib/clubTypes";

const ROLES: MemberRole[] = ["owner", "admin", "coach", "member"];
const ROLE_ORDER: Record<MemberRole, number> = { owner: 0, admin: 1, coach: 2, member: 3 };

export default function MembersPage() {
  const { user, loading } = useAuth();
  const [clubId, setClubId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<MemberRole | null>(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const router = useRouter();

  /**
   * Open (or create) a private thread with this member.
   *
   * No paywall check here: the web has no purchase flow, so gating would just
   * dead-end. openDmThread still enforces the real constraint — that the two
   * share a club — server-side.
   */
  const handleMessage = async (uid: string) => {
    if (opening) return;
    setOpening(uid);
    try {
      const threadId = await openDmThread(uid);
      router.push(`/dashboard/dm?thread=${threadId}`);
    } catch {
      window.alert("Couldn't open that conversation.");
    } finally {
      setOpening(null);
    }
  };

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
                    <Avatar uri={m.avatarUrl} name={m.displayName} uid={m.uid} role={m.role} size={32} />
                    <span style={{ fontWeight: 600 }}>{m.displayName}</span>
                    {m.uid === user?.uid ? (
                      <span style={{ fontSize: 11, background: "#EBF3FB", color: "var(--blue-bright)", borderRadius: 8, padding: "2px 7px", fontWeight: 700 }}>You</span>
                    ) : (
                      <button
                        onClick={() => void handleMessage(m.uid)}
                        disabled={opening === m.uid}
                        title={`Message ${m.displayName}`}
                        style={{ border: "none", background: "transparent", cursor: opening === m.uid ? "default" : "pointer", fontSize: 15, padding: 0, opacity: opening === m.uid ? 0.5 : 1 }}
                      >
                        💬
                      </button>
                    )}
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
