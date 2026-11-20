import { weekStart as fnWeekStart, workoutDeltas } from "../../../firebase/functions/src/workouts";
import {
  addDays,
  formatMinutes,
  leaderboard,
  weekLabel,
  weekStart,
  weekStreak,
  weekTotals,
} from "../workouts";

describe("weeks", () => {
  it("starts on Monday", () => {
    expect(weekStart("2026-11-19")).toBe("2026-11-16"); // Thu
    expect(weekStart("2026-11-16")).toBe("2026-11-16"); // Mon
    expect(weekStart("2026-11-22")).toBe("2026-11-16"); // Sun
    expect(weekStart("2026-11-23")).toBe("2026-11-23");
    expect(weekStart("2027-01-01")).toBe("2026-12-28"); // across a year
  });

  it("matches the Cloud Function", () => {
    for (let i = 0; i < 400; i++) {
      const d = addDays("2026-01-01", i);
      expect(weekStart(d)).toBe(fnWeekStart(d));
    }
  });

  it("labels weeks", () => {
    expect(weekLabel("2026-11-16")).toBe("Nov 16 – 22");
    expect(weekLabel("2026-11-30")).toBe("Nov 30 – Dec 6");
  });

  it("formats minutes", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(90)).toBe("1 h 30 m");
    expect(formatMinutes(120)).toBe("2 h");
  });
});

describe("streaks", () => {
  it("counts consecutive weeks", () => {
    const today = "2026-11-19";
    expect(weekStreak(["2026-11-17", "2026-11-10", "2026-11-03"], today)).toBe(3);
    expect(weekStreak(["2026-11-17", "2026-11-03"], today)).toBe(1);
    // Nothing yet this week still counts the run up to last week.
    expect(weekStreak(["2026-11-10", "2026-11-04"], today)).toBe(2);
    expect(weekStreak(["2026-10-01"], today)).toBe(0);
    expect(weekStreak([], today)).toBe(0);
  });
});

describe("leaderboard", () => {
  const week = {
    totals: {
      a: { name: "Kai", count: 4, minutes: 200 },
      b: { name: "Lei", count: 4, minutes: 200 },
      c: { name: "Noa", count: 5, minutes: 100 },
      d: { name: "Gone", count: 0, minutes: 0 },
    },
  };

  it("ranks by workouts then minutes, sharing ties", () => {
    const rows = leaderboard(week, () => undefined);
    expect(rows.map((r) => [r.name, r.rank])).toEqual([
      ["Noa", 1],
      ["Kai", 2],
      ["Lei", 2],
    ]);
  });

  it("prefers current roster names", () => {
    expect(leaderboard(week, (u) => (u === "c" ? "Noelani" : undefined))[0]!.name).toBe("Noelani");
  });

  it("totals the team", () => {
    expect(weekTotals(week)).toEqual({ people: 3, count: 13, minutes: 500 });
    expect(weekTotals(null)).toEqual({ people: 0, count: 0, minutes: 0 });
  });
});

describe("workoutDeltas", () => {
  const w = { uid: "kai", name: "Kai", date: "2026-11-19", minutes: 45 };
  it("adds and removes", () => {
    expect(workoutDeltas(undefined, w)).toEqual([{ week: "2026-11-16", uid: "kai", name: "Kai", count: 1, minutes: 45 }]);
    expect(workoutDeltas(w, undefined)).toEqual([{ week: "2026-11-16", uid: "kai", count: -1, minutes: -45 }]);
  });
  it("moves between weeks on a date change", () => {
    const d = workoutDeltas(w, { ...w, date: "2026-11-24", minutes: 60 });
    expect(d).toEqual([
      { week: "2026-11-16", uid: "kai", count: -1, minutes: -45 },
      { week: "2026-11-23", uid: "kai", name: "Kai", count: 1, minutes: 60 },
    ]);
  });
  it("adjusts minutes in place", () => {
    expect(workoutDeltas(w, { ...w, minutes: 60 })).toEqual([
      { week: "2026-11-16", uid: "kai", name: "Kai", count: 0, minutes: 15 },
    ]);
  });
});
