"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { getClubMembers, getUserClub } from "@/lib/firebase";
import type { Club, ClubMember, MemberRole } from "@/lib/clubTypes";
import {
  addDays,
  addWorkout,
  canSeeWorkoutDetails,
  clubIsPro,
  deleteWorkout,
  formatMinutes,
  importMyPaddles,
  leaderboard,
  localDate,
  subscribeClubWorkouts,
  subscribeMyWorkouts,
  subscribeWorkoutWeek,
  weekLabel,
  weekStart,
  weekStreak,
  weekTotals,
  WORKOUT_KINDS,
  WORKOUT_MINUTE_PRESETS,
  WORKOUT_MINUTES_MAX,
  WORKOUT_NOTE_MAX,
  workoutKindInfo,
  type Workout,
  type WorkoutKind,
  type WorkoutWeek,
} from "@/lib/workouts";

const MEDALS = ["🥇", "🥈", "🥉"];

interface Ctx {
  club: Club;
  role: MemberRole;
}

/** Training log: log workouts, weekly leaderboard, and (staff) the team log. */
export default function TrainingPage() {
  const { user, loading } = useAuth();
  const [ctx, setCtx] = useState<Ctx | null | "none">(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const today = localDate();
  const thisWeek = weekStart(today);
  const lastWeek = addDays(thisWeek, -7);
  const [shownWeek, setShownWeek] = useState(thisWeek);
  const [weekDoc, setWeekDoc] = useState<WorkoutWeek | null>(null);
  const [thisWeekDoc, setThisWeekDoc] = useState<WorkoutWeek | null>(null);
  const [mine, setMine] = useState<Workout[] | null>(null);
  const [team, setTeam] = useState<Workout[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getUserClub(user.uid).then((r) => {
      if (!r) return setCtx("none");
      setCtx({ club: r.club, role: r.role });
      getClubMembers(r.club.id).then(setMembers).catch(() => undefined);
    });
  }, [user]);

  const club = ctx && ctx !== "none" ? ctx.club : null;
  const clubId = club?.id ?? null;
  const pro = clubIsPro(club);
  const isStaff = ctx && ctx !== "none" ? canSeeWorkoutDetails(ctx.role) : false;
  const uid = user?.uid ?? "";
  const myName = members.find((m) => m.uid === uid)?.displayName ?? user?.displayName ?? "Member";

  useEffect(() => {
    if (!clubId || !pro) return;
    return subscribeWorkoutWeek(clubId, shownWeek, setWeekDoc);
  }, [clubId, pro, shownWeek]);
  useEffect(() => {
    if (!clubId || !pro) return;
    return subscribeWorkoutWeek(clubId, thisWeek, setThisWeekDoc);
  }, [clubId, pro, thisWeek]);
  useEffect(() => {
    if (!clubId || !pro || !uid) return;
    return subscribeMyWorkouts(clubId, uid, setMine);
  }, [clubId, pro, uid]);
  useEffect(() => {
    if (!clubId || !pro || !isStaff) return;
    return subscribeClubWorkouts(clubId, lastWeek, setTeam);
  }, [clubId, pro, isStaff, lastWeek]);

  // Same rule as the app: people already using the log get their recorded
  // paddles counted automatically; others get a button.
  const participating = (mine?.length ?? 0) > 0;
  const autoImported = useRef(false);
  const runImport = async (quiet: boolean) => {
    if (!clubId || !uid || !mine) return;
    setImporting(true);
    try {
      const n = await importMyPaddles(clubId, uid, myName, lastWeek, new Set(mine.map((w) => w.id)));
      if (!quiet) alert(n ? `${n} recorded paddle${n === 1 ? "" : "s"} from the last two weeks now count. 🛶` : "No new recorded paddles from the last two weeks.");
    } catch {
      if (!quiet) setError("Couldn't add your paddles.");
    } finally {
      setImporting(false);
    }
  };
  useEffect(() => {
    if (autoImported.current || !mine || !participating) return;
    autoImported.current = true;
    void runImport(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, participating]);

  const nameFor = useMemo(() => {
    const m = new Map(members.map((x) => [x.uid, x.displayName]));
    return (u: string) => m.get(u);
  }, [members]);

  if (loading || ctx === null) return <Shell><p className="muted">Loading…</p></Shell>;
  if (!user) return <Shell><p>Please <Link href="/login" style={{ color: "var(--blue-bright)" }}>sign in</Link>.</p></Shell>;
  if (ctx === "none" || !club) return <Shell><p className="muted">Join a club in the app first.</p></Shell>;
  if (!pro) {
    return (
      <Shell>
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 44 }}>💪</div>
          <h2 style={{ margin: "8px 0" }}>Training log is an ImuaTrak+ feature</h2>
          <p className="muted" style={{ maxWidth: 520, margin: "0 auto" }}>
            Members log their off-the-water workouts, recorded paddles count automatically, and a weekly
            leaderboard keeps the crew motivated. Coaches see what everyone&apos;s doing.
          </p>
          {(ctx.role === "owner" || ctx.role === "admin") && (
            <p style={{ marginTop: 16 }}>
              <Link href="/dashboard/club/settings" style={{ color: "var(--blue-bright)", fontWeight: 700 }}>Upgrade your club →</Link>
            </p>
          )}
        </div>
      </Shell>
    );
  }

  const rows = leaderboard(weekDoc, nameFor);
  const teamNow = weekTotals(thisWeekDoc);
  const myThisWeek = (mine ?? []).filter((w) => weekStart(w.date) === thisWeek);
  const streak = weekStreak((mine ?? []).map((w) => w.date), today);
  const myRecent = [...(mine ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 12);

  const teamWeek = team.filter((w) => weekStart(w.date) === shownWeek);
  const byPerson = new Map<string, Workout[]>();
  for (const w of teamWeek) byPerson.set(w.uid, [...(byPerson.get(w.uid) ?? []), w]);
  const people = [...byPerson.entries()].sort(
    (a, b) => b[1].length - a[1].length || (nameFor(a[0]) ?? a[1][0]!.name).localeCompare(nameFor(b[0]) ?? b[1][0]!.name),
  );

  const remove = (w: Workout) => {
    if (!confirm(`Delete this ${workoutKindInfo(w.kind).label.toLowerCase()} (${formatMinutes(w.minutes)}, ${w.date})?`)) return;
    void deleteWorkout(club.id, w.id).catch(() => setError("Couldn't delete that workout."));
  };

  return (
    <Shell>
      {error && (
        <div className="card" style={{ marginBottom: 12, borderLeft: "4px solid var(--danger)", display: "flex", justifyContent: "space-between" }}>
          <span>{error}</span>
          <button style={linkBtn} onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", alignItems: "start" }}>
        <div className="card" style={{ background: "linear-gradient(135deg, #1573C4, #07314F)", color: "#fff", border: "none" }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.2, opacity: 0.85 }}>THIS WEEK · {weekLabel(thisWeek).toUpperCase()}</div>
          <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}>{teamNow.count} workout{teamNow.count === 1 ? "" : "s"} 🔥</div>
          <div style={{ opacity: 0.9 }}>{teamNow.people} paddler{teamNow.people === 1 ? "" : "s"} · {formatMinutes(teamNow.minutes)} as a team</div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.3)", marginTop: 14, paddingTop: 10, fontWeight: 700 }}>
            <span>You: {myThisWeek.length} · {formatMinutes(myThisWeek.reduce((n, w) => n + w.minutes, 0))}</span>
            {streak > 1 && <span>🔥 {streak}-week streak</span>}
          </div>
          {!participating && mine !== null && (
            <button style={{ ...ghostBtn, color: "#fff", borderColor: "rgba(255,255,255,0.6)", marginTop: 14 }} disabled={importing} onClick={() => void runImport(false)}>
              {importing ? "Adding…" : "🛶 Count my recorded paddles"}
            </button>
          )}
        </div>

        <LogForm
          today={today}
          onSave={async (w) => {
            await addWorkout(club.id, { uid, name: myName, ...w });
          }}
          onError={setError}
        />
      </div>

      <div style={{ display: "flex", gap: 8, margin: "24px 0 12px" }}>
        {[
          [thisWeek, "This week"],
          [lastWeek, "Last week"],
        ].map(([w, label]) => (
          <button key={w} style={pill(shownWeek === w)} onClick={() => setShownWeek(w!)}>{label}</button>
        ))}
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", alignItems: "start" }}>
        <div>
          <h3 style={sectionTitle}>Leaderboard · {weekLabel(shownWeek)}</h3>
          <div className="card" style={{ padding: 0 }}>
            {rows.length === 0 ? (
              <p className="muted" style={{ padding: 20, margin: 0, textAlign: "center" }}>
                {shownWeek === thisWeek ? "No workouts yet this week. Be the first! 💪" : "Nobody logged anything that week."}
              </p>
            ) : (
              <table style={table}>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.uid} style={{ borderTop: "1px solid var(--line)", background: r.uid === uid ? "color-mix(in srgb, var(--blue-bright) 10%, transparent)" : undefined }}>
                      <td style={{ ...td, width: 44, textAlign: "center", fontSize: 18, fontWeight: 800, color: "var(--muted)" }}>{r.rank <= 3 ? MEDALS[r.rank - 1] : r.rank}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{r.name}{r.uid === uid ? " (you)" : ""}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <div style={{ fontWeight: 800, fontSize: 18 }}>{r.count}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{formatMinutes(r.minutes)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="muted" style={{ fontSize: 12 }}>Ranked by workouts, then time. Everyone in the club sees this board.</p>

          {myRecent.length > 0 && (
            <>
              <h3 style={{ ...sectionTitle, marginTop: 20 }}>My workouts</h3>
              <div className="card" style={{ padding: 0 }}>
                <table style={table}>
                  <tbody>
                    {myRecent.map((w) => (
                      <tr key={w.id} style={{ borderTop: "1px solid var(--line)" }}>
                        <td style={td}>
                          <div style={{ fontWeight: 700 }}>{workoutKindInfo(w.kind).emoji} {workoutKindInfo(w.kind).label}{w.sessionId ? " · recorded" : ""}</div>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {new Date(`${w.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                            {w.note ? ` · ${w.note}` : ""}
                          </div>
                        </td>
                        <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{formatMinutes(w.minutes)}</td>
                        <td style={{ ...td, textAlign: "right" }}><button style={linkBtn} onClick={() => remove(w)}>Delete</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {isStaff && (
          <div>
            <h3 style={sectionTitle}>Team log · {weekLabel(shownWeek)}</h3>
            <div className="card" style={{ padding: 0 }}>
              {people.length === 0 ? (
                <p className="muted" style={{ padding: 20, margin: 0, textAlign: "center" }}>Nothing logged yet.</p>
              ) : (
                people.map(([personUid, list]) => (
                  <div key={personUid} style={{ borderTop: "1px solid var(--line)", padding: "12px 16px" }}>
                    <div style={{ fontWeight: 700 }}>
                      {nameFor(personUid) ?? list[0]!.name}{" "}
                      <span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>· {list.length} · {formatMinutes(list.reduce((n, w) => n + w.minutes, 0))}</span>
                    </div>
                    {[...list].sort((a, b) => a.date.localeCompare(b.date)).map((w) => (
                      <div key={w.id} style={{ fontSize: 14, display: "flex", gap: 8, alignItems: "baseline", marginTop: 4 }}>
                        <span style={{ flex: 1 }}>
                          {workoutKindInfo(w.kind).emoji} {new Date(`${w.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })} · {formatMinutes(w.minutes)}
                          {w.note ? <span className="muted"> · {w.note}</span> : null}
                        </span>
                        <button style={{ ...linkBtn, fontSize: 12, color: "var(--muted)" }} onClick={() => remove(w)} title="Delete">✕</button>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
            <p className="muted" style={{ fontSize: 12 }}>Only coaches and admins see the team log.</p>
          </div>
        )}
      </div>
    </Shell>
  );
}

function LogForm({
  today,
  onSave,
  onError,
}: {
  today: string;
  onSave: (w: { kind: WorkoutKind; minutes: number; date: string; note?: string }) => Promise<void>;
  onError: (m: string) => void;
}) {
  const [kind, setKind] = useState<WorkoutKind>("gym");
  const [minutes, setMinutes] = useState(45);
  const [custom, setCustom] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, -i));

  const save = async () => {
    const m = custom ? parseInt(custom, 10) : minutes;
    if (!Number.isFinite(m) || m < 1 || m > WORKOUT_MINUTES_MAX) return onError(`Enter between 1 and ${WORKOUT_MINUTES_MAX} minutes.`);
    setSaving(true);
    try {
      await onSave({ kind, minutes: m, date, note });
      setNote("");
      setCustom("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <strong style={{ fontSize: 17 }}>Log a workout</strong>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {WORKOUT_KINDS.map((k) => (
          <button key={k.kind} style={pill(kind === k.kind)} onClick={() => setKind(k.kind)}>{k.emoji} {k.label}</button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {WORKOUT_MINUTE_PRESETS.map((m) => (
          <button key={m} style={pill(!custom && minutes === m)} onClick={() => { setMinutes(m); setCustom(""); }}>{formatMinutes(m)}</button>
        ))}
        <input style={{ ...inp, width: 110 }} inputMode="numeric" placeholder="Other min" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 3))} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {days.map((d, i) => (
          <button key={d} style={pill(date === d)} onClick={() => setDate(d)}>
            {i === 0 ? "Today" : i === 1 ? "Yesterday" : new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}
          </button>
        ))}
      </div>
      <input style={inp} placeholder="Note (optional), e.g. 5 x 400m intervals" maxLength={WORKOUT_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button style={primaryBtn} disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save workout"}</button>
        {saved && <span style={{ color: "var(--success)", fontWeight: 700 }}>Logged ✓</span>}
      </div>
      <span className="muted" style={{ fontSize: 12 }}>Coaches and admins can see your notes. The leaderboard only shows counts and time.</span>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="container" style={{ paddingBottom: 80 }}>
      <Link href="/dashboard/club" style={{ color: "var(--muted)", fontSize: 13, textDecoration: "none" }}>← Club Dashboard</Link>
      <h1 style={{ margin: "8px 0 20px", fontSize: 28, fontWeight: 800 }}>Training</h1>
      {children}
    </main>
  );
}

const primaryBtn: React.CSSProperties = { background: "var(--blue)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, cursor: "pointer", fontSize: 14 };
const ghostBtn: React.CSSProperties = { background: "transparent", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: 13 };
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: "var(--blue-bright)", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontSize: 14, fontFamily: "inherit" };
const pill = (on: boolean): React.CSSProperties => ({
  padding: "6px 12px",
  borderRadius: 999,
  border: `1.5px solid ${on ? "var(--aqua)" : "var(--line)"}`,
  background: on ? "color-mix(in srgb, var(--aqua) 18%, transparent)" : "transparent",
  color: "inherit",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: on ? 700 : 500,
});
const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "var(--muted)", margin: "0 0 8px" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
const td: React.CSSProperties = { padding: "10px 14px", verticalAlign: "middle" };
