/**
 * Training log on the web. The pure half is mirrored from
 * src/models/workouts.ts and the writes from src/services/workoutService.ts;
 * both must produce the shapes firestore.rules accepts (workouts /
 * workoutWeeks), so keep them in step.
 *
 * Club Training log: members log off-the-water workouts (and their recorded
 * paddles count automatically); a weekly leaderboard keeps it fun. Pro clubs.
 *
 * Privacy: everyone sees the leaderboard (name, workouts, minutes); only
 * owners/admins/coaches see the entries themselves (type, notes). Enforced by
 * firestore.rules: workouts/ is readable by staff or the owner, and the
 * per-week totals in workoutWeeks/ are kept by the onWorkoutWrite function.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import type { MemberRole } from "./clubTypes";
import { db } from "./firebase";

export type WorkoutKind = "paddle" | "gym" | "run" | "bike" | "swim" | "yoga" | "other";

export interface Workout {
  id: string;
  uid: string;
  name: string;
  kind: WorkoutKind;
  minutes: number;
  /** Member's local calendar date, YYYY-MM-DD. */
  date: string;
  note?: string;
  /** Set for paddles imported from a recorded ImuaTrak session. */
  sessionId?: string;
  createdAt: string;
}

/** workoutWeeks/{monday}: the leaderboard for one week. */
export interface WorkoutWeek {
  totals?: Record<string, { name?: string; count: number; minutes: number }>;
}

export const WORKOUT_KINDS: { kind: WorkoutKind; label: string; emoji: string }[] = [
  { kind: "gym", label: "Gym", emoji: "🏋️" },
  { kind: "run", label: "Run", emoji: "🏃" },
  { kind: "bike", label: "Bike", emoji: "🚴" },
  { kind: "swim", label: "Swim", emoji: "🏊" },
  { kind: "yoga", label: "Yoga / stretch", emoji: "🧘" },
  { kind: "paddle", label: "Paddle", emoji: "🛶" },
  { kind: "other", label: "Other", emoji: "💪" },
];

export const workoutKindInfo = (k: WorkoutKind) =>
  WORKOUT_KINDS.find((x) => x.kind === k) ?? WORKOUT_KINDS[WORKOUT_KINDS.length - 1]!;

export const WORKOUT_MINUTES_MAX = 600;
export const WORKOUT_NOTE_MAX = 200;
export const WORKOUT_MINUTE_PRESETS = [15, 30, 45, 60, 90];

export function canSeeWorkoutDetails(role: MemberRole | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "coach";
}

/** Local calendar date as YYYY-MM-DD. */
export function localDate(d: Date = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Monday of the week containing a YYYY-MM-DD date (mirrors the function's). */
export function weekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
  const back = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - back * 86_400_000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1) + days * 86_400_000).toISOString().slice(0, 10);
}

/** "Nov 16 – 22" for a week's Monday. */
export function weekLabel(monday: string): string {
  const [y, m, d] = monday.split("-").map(Number);
  const start = new Date(y!, m! - 1, d!);
  const end = new Date(y!, m! - 1, d! + 6);
  const mon = (x: Date) => x.toLocaleDateString("en-US", { month: "short" });
  return start.getMonth() === end.getMonth()
    ? `${mon(start)} ${start.getDate()} – ${end.getDate()}`
    : `${mon(start)} ${start.getDate()} – ${mon(end)} ${end.getDate()}`;
}

/** "45 min", "1 h 30 m". */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} m` : `${h} h`;
}

export interface LeaderRow {
  uid: string;
  name: string;
  count: number;
  minutes: number;
  rank: number;
}

/**
 * Ranked by workouts, then minutes. Ties share a rank and the next person
 * takes the next number (1, 2, 2, 3), not a skipped one (1, 2, 2, 4) — a
 * skipped number read as a mistake on a friendly club board. Empty weeks
 * drop out.
 */
export function leaderboard(week: WorkoutWeek | null | undefined, nameFor: (uid: string) => string | undefined): LeaderRow[] {
  const rows = Object.entries(week?.totals ?? {})
    .filter(([, t]) => t.count > 0)
    .map(([uid, t]) => ({ uid, name: nameFor(uid) ?? t.name ?? "Member", count: t.count, minutes: Math.max(0, t.minutes) }))
    .sort((a, b) => b.count - a.count || b.minutes - a.minutes || a.name.localeCompare(b.name));
  let rank = 0;
  return rows.map((r, i) => {
    const prev = rows[i - 1];
    if (!prev || prev.count !== r.count || prev.minutes !== r.minutes) rank += 1;
    return { ...r, rank };
  });
}

export function weekTotals(week: WorkoutWeek | null | undefined): { people: number; count: number; minutes: number } {
  let people = 0;
  let count = 0;
  let minutes = 0;
  for (const t of Object.values(week?.totals ?? {})) {
    if (t.count <= 0) continue;
    people += 1;
    count += t.count;
    minutes += Math.max(0, t.minutes);
  }
  return { people, count, minutes };
}

/**
 * Weeks in a row (ending this week, or last week if nothing yet this week)
 * with at least one workout.
 */
export function weekStreak(dates: string[], today: string = localDate()): number {
  const weeks = new Set(dates.map(weekStart));
  let w = weekStart(today);
  if (!weeks.has(w)) w = addDays(w, -7);
  let n = 0;
  while (weeks.has(w)) {
    n += 1;
    w = addDays(w, -7);
  }
  return n;
}

/** Deterministic id for an imported paddle, so re-importing never duplicates. */
export const paddleWorkoutId = (uid: string, sessionId: string) => `paddle_${uid}_${sessionId}`;

/** Pro (paid, or a trial still running) — mirrors clubIsPro in the app. */
export function clubIsPro(club: { subscriptionStatus?: string; trialEndsAt?: string } | null | undefined): boolean {
  if (!club) return false;
  if (club.subscriptionStatus === "active") return true;
  return club.subscriptionStatus === "trial" && typeof club.trialEndsAt === "string" && club.trialEndsAt > new Date().toISOString();
}

// ── Firestore ────────────────────────────────────────────────────────────────

const workoutsCol = (clubId: string) => collection(db, "clubs", clubId, "workouts");

export function subscribeWorkoutWeek(clubId: string, monday: string, onData: (w: WorkoutWeek | null) => void) {
  return onSnapshot(
    doc(db, "clubs", clubId, "workoutWeeks", monday),
    (snap) => onData(snap.exists() ? (snap.data() as WorkoutWeek) : null),
    () => onData(null),
  );
}

/** Mine — a member's query must filter on their own uid. */
export function subscribeMyWorkouts(clubId: string, uid: string, onData: (w: Workout[]) => void) {
  return onSnapshot(
    query(workoutsCol(clubId), where("uid", "==", uid)),
    (snap) => onData(snap.docs.map((d) => ({ ...(d.data() as Omit<Workout, "id">), id: d.id }))),
    () => onData([]),
  );
}

/** Everyone's since a date (coaches/admins). */
export function subscribeClubWorkouts(clubId: string, sinceDate: string, onData: (w: Workout[]) => void) {
  return onSnapshot(
    query(workoutsCol(clubId), where("date", ">=", sinceDate)),
    (snap) => onData(snap.docs.map((d) => ({ ...(d.data() as Omit<Workout, "id">), id: d.id }))),
    () => onData([]),
  );
}

export async function addWorkout(
  clubId: string,
  w: { uid: string; name: string; kind: WorkoutKind; minutes: number; date: string; note?: string },
): Promise<void> {
  const note = w.note?.trim();
  await setDoc(doc(workoutsCol(clubId)), {
    uid: w.uid,
    name: w.name.slice(0, 100),
    kind: w.kind,
    minutes: Math.max(1, Math.min(WORKOUT_MINUTES_MAX, Math.round(w.minutes))),
    date: w.date,
    ...(note ? { note: note.slice(0, 200) } : {}),
    createdAt: new Date().toISOString(),
  });
}

export async function deleteWorkout(clubId: string, id: string): Promise<void> {
  await deleteDoc(doc(workoutsCol(clubId), id));
}

/** Count recorded ImuaTrak paddles since a date (same ids as the app, so no doubles). */
export async function importMyPaddles(
  clubId: string,
  uid: string,
  name: string,
  sinceDate: string,
  existing: Set<string>,
): Promise<number> {
  const since = new Date(`${sinceDate}T00:00:00`).toISOString();
  const snap = await getDocs(query(collection(db, "users", uid, "sessions"), where("startedAt", ">=", since)));
  let added = 0;
  for (const d of snap.docs) {
    const s = d.data() as { startedAt: string; totals?: { durationSec?: number } };
    const id = paddleWorkoutId(uid, d.id);
    if (existing.has(id)) continue;
    const minutes = Math.round((s.totals?.durationSec ?? 0) / 60);
    if (minutes < 1) continue;
    await setDoc(doc(workoutsCol(clubId), id), {
      uid,
      name: name.slice(0, 100),
      kind: "paddle",
      minutes: Math.min(WORKOUT_MINUTES_MAX, minutes),
      date: localDate(new Date(s.startedAt)),
      sessionId: d.id,
      createdAt: new Date().toISOString(),
    });
    added += 1;
  }
  return added;
}
