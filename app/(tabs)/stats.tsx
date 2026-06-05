import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { list, type StoredSession } from "@/services/storage";
import { useSettings } from "@/services/settings";
import { AdBanner } from "@/ui/AdBanner";
import { GradientCard } from "@/ui/GradientCard";
import { GradientHeader } from "@/ui/GradientHeader";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { formatDistance, formatDuration, formatPaceStr } from "@/ui/format";
import { colors, spacing, type } from "@/ui/theme";

interface Stats {
  totalSessions: number;
  totalDistanceM: number;
  totalDurationSec: number;
  totalCalories: number;
  longestDistanceM: number;
  longestDurationSec: number;
  fastestPaceSecPerKm: number;
  mostStrokes: number;
  currentStreakDays: number;
  longestStreakDays: number;
  topCraft: string;
}

function computeStats(sessions: StoredSession[]): Stats {
  const empty: Stats = {
    totalSessions: 0, totalDistanceM: 0, totalDurationSec: 0, totalCalories: 0,
    longestDistanceM: 0, longestDurationSec: 0, fastestPaceSecPerKm: 0,
    mostStrokes: 0, currentStreakDays: 0, longestStreakDays: 0, topCraft: "—",
  };
  if (sessions.length === 0) return empty;

  let longestDistanceM = 0;
  let longestDurationSec = 0;
  let fastestPace = Infinity;
  let mostStrokes = 0;
  let totalDistanceM = 0;
  let totalDurationSec = 0;
  let totalCalories = 0;
  const craftCounts: Record<string, number> = {};
  const activityDates = new Set<string>();

  for (const { session: s } of sessions) {
    const t = s.totals;
    if (t.distanceMeters > longestDistanceM) longestDistanceM = t.distanceMeters;
    if (t.durationSec > longestDurationSec) longestDurationSec = t.durationSec;
    if (t.avgPaceSecPerKm > 0 && t.avgPaceSecPerKm < fastestPace) fastestPace = t.avgPaceSecPerKm;
    if (t.strokeCount > mostStrokes) mostStrokes = t.strokeCount;
    totalDistanceM += t.distanceMeters;
    totalDurationSec += t.durationSec;
    totalCalories += t.calories ?? 0;
    craftCounts[s.craftType] = (craftCounts[s.craftType] ?? 0) + 1;
    activityDates.add(s.startedAt.slice(0, 10));
  }

  const topCraft = Object.entries(craftCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  // Streak calculation
  const sorted = Array.from(activityDates).sort();
  let longestStreakDays = 1;
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diffMs = new Date(sorted[i]!).getTime() - new Date(sorted[i - 1]!).getTime();
    if (Math.round(diffMs / 86400000) === 1) {
      streak++;
      if (streak > longestStreakDays) longestStreakDays = streak;
    } else {
      streak = 1;
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const lastDate = sorted[sorted.length - 1]!;
  let currentStreakDays = 0;
  if (lastDate === today || lastDate === yesterday) {
    currentStreakDays = 1;
    for (let i = sorted.length - 2; i >= 0; i--) {
      const diffMs = new Date(sorted[i + 1]!).getTime() - new Date(sorted[i]!).getTime();
      if (Math.round(diffMs / 86400000) === 1) { currentStreakDays++; } else { break; }
    }
  }

  return {
    totalSessions: sessions.length,
    totalDistanceM,
    totalDurationSec,
    totalCalories,
    longestDistanceM,
    longestDurationSec,
    fastestPaceSecPerKm: fastestPace === Infinity ? 0 : fastestPace,
    mostStrokes,
    currentStreakDays,
    longestStreakDays,
    topCraft,
  };
}

export default function StatsTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const units = useSettings((s) => s.units);

  useFocusEffect(
    useCallback(() => {
      void list().then((sessions) => setStats(computeStats(sessions)));
    }, []),
  );

  if (!stats) return <ScreenBackground><GradientHeader title="Stats" subtitle="Your paddling story" /></ScreenBackground>;

  return (
    <ScreenBackground>
      <GradientHeader
        title="Stats"
        subtitle={stats.totalSessions > 0 ? `${stats.totalSessions} paddle${stats.totalSessions === 1 ? "" : "s"}` : "No sessions yet"}
      />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>

        {stats.totalSessions === 0 ? (
          <GradientCard>
            <Text style={styles.emptyText}>Record your first paddle to see stats here.</Text>
          </GradientCard>
        ) : (
          <>
            {/* Totals */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Totals</Text>
              <View style={styles.grid}>
                <StatCard label="Sessions" value={String(stats.totalSessions)} />
                <StatCard label="Distance" value={formatDistance(stats.totalDistanceM, units)} />
                <StatCard label="Time" value={formatDuration(stats.totalDurationSec)} />
                <StatCard
                  label="Calories"
                  value={stats.totalCalories > 0 ? `${Math.round(stats.totalCalories).toLocaleString()} kcal` : "—"}
                />
              </View>
            </View>

            {/* Personal bests */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Personal Bests</Text>
              <View style={styles.grid}>
                <StatCard label="Longest paddle" value={formatDistance(stats.longestDistanceM, units)} accent />
                <StatCard label="Longest session" value={formatDuration(stats.longestDurationSec)} accent />
                {stats.fastestPaceSecPerKm > 0 && (
                  <StatCard label="Fastest pace" value={formatPaceStr(stats.fastestPaceSecPerKm, units)} accent />
                )}
                <StatCard label="Most strokes" value={stats.mostStrokes.toLocaleString()} accent />
              </View>
            </View>

            {/* Streaks & habits */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Habits</Text>
              <View style={styles.grid}>
                <StatCard label="Current streak" value={`${stats.currentStreakDays} day${stats.currentStreakDays === 1 ? "" : "s"}`} />
                <StatCard label="Longest streak" value={`${stats.longestStreakDays} day${stats.longestStreakDays === 1 ? "" : "s"}`} />
                <StatCard label="Favourite craft" value={stats.topCraft} />
              </View>
            </View>
          </>
        )}
      </ScrollView>
      <AdBanner />
    </ScreenBackground>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <GradientCard style={styles.statCard} gradient={accent ? "ocean" : undefined}>
      <Text style={[styles.statLabel, accent && { color: "rgba(255,255,255,0.7)" }]}>{label}</Text>
      <Text style={[styles.statValue, accent && { color: colors.white }]}>{value}</Text>
    </GradientCard>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.lg },
  sectionLabel: {
    fontSize: type.size.xs,
    fontWeight: type.weight.heavy,
    letterSpacing: type.spacing.label,
    color: colors.muted,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  // Two-column grid. Explicit widths (not flex) so the wrap container measures
  // its height correctly — flex items inside flexWrap collapse the row height in
  // Yoga and cause sections to overlap.
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: spacing.sm },
  statCard: { width: "48.5%" },
  statLabel: { fontSize: type.size.xs, color: colors.muted, fontWeight: type.weight.bold, textTransform: "uppercase", letterSpacing: 0.8 },
  statValue: { fontSize: type.size.xl, fontWeight: type.weight.heavy, color: colors.ink, marginTop: spacing.xs, ...type.mono },
  emptyText: { color: colors.muted, textAlign: "center", fontSize: type.size.md, paddingVertical: spacing.lg },
});
