/**
 * Pure helpers for the club Training log (no Firebase imports, so the app's
 * Jest tests them: src/services/__tests__/workoutWeeks.test.ts).
 *
 * Weeks run Monday–Sunday and are named by their Monday, "YYYY-MM-DD". Dates
 * are the member's local calendar date as written by the app, so week math
 * here is plain calendar arithmetic with no time zones involved.
 */

export interface WorkoutSnapshot {
  uid: string;
  name?: string;
  date: string; // YYYY-MM-DD
  minutes: number;
}

/** Monday of the week containing a YYYY-MM-DD date. */
export function weekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
  const dow = new Date(t).getUTCDay(); // 0 = Sunday
  const back = (dow + 6) % 7; // days since Monday
  return new Date(t - back * 86_400_000).toISOString().slice(0, 10);
}

export interface WeekDelta {
  week: string;
  uid: string;
  name?: string;
  count: number;
  minutes: number;
}

/**
 * How a workout change moves the weekly leaderboard: remove the old entry's
 * contribution, add the new one's. A date or owner change touches two weeks
 * or two people.
 */
export function workoutDeltas(before?: WorkoutSnapshot, after?: WorkoutSnapshot): WeekDelta[] {
  const out = new Map<string, WeekDelta>();
  const add = (w: WorkoutSnapshot, sign: 1 | -1) => {
    const week = weekStart(w.date);
    const key = `${week}|${w.uid}`;
    const cur = out.get(key) ?? { week, uid: w.uid, count: 0, minutes: 0 };
    cur.count += sign;
    cur.minutes += sign * Math.max(0, Math.round(w.minutes || 0));
    if (sign === 1 && w.name) cur.name = w.name;
    out.set(key, cur);
  };
  if (before) add(before, -1);
  if (after) add(after, 1);
  return [...out.values()].filter((d) => d.count !== 0 || d.minutes !== 0 || d.name);
}
