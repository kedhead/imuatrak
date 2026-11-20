import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { localDate, weekStart, weekTotals, type WorkoutWeek } from "@/models/workouts";
import { subscribeWorkoutWeek } from "@/services/workoutService";
import { AnimatedPressable } from "./AnimatedPressable";
import { colors, radii, shadow, spacing, type } from "./theme";

/** "💪 Training · 14 workouts this week" on the club home (Pro clubs). */
export function TrainingBanner({ clubId }: { clubId: string }) {
  const router = useRouter();
  const [week, setWeek] = useState<WorkoutWeek | null>(null);
  const monday = weekStart(localDate());
  useEffect(() => subscribeWorkoutWeek(clubId, monday, setWeek), [clubId, monday]);
  const t = weekTotals(week);

  return (
    <AnimatedPressable haptic style={styles.card} onPress={() => router.push("/club/training" as never)}>
      <Text style={styles.emoji}>💪</Text>
      <View style={styles.flex}>
        <Text style={styles.title}>Training</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {t.count > 0
            ? `${t.count} workout${t.count === 1 ? "" : "s"} this week · ${t.people} paddler${t.people === 1 ? "" : "s"}`
            : "Log your workouts · weekly leaderboard"}
        </Text>
      </View>
      <View style={styles.cta}>
        <Ionicons name="add" size={14} color={colors.white} />
        <Text style={styles.ctaText}>Log</Text>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    ...shadow.sm,
  },
  flex: { flex: 1, minWidth: 0 },
  emoji: { fontSize: 24 },
  title: { fontSize: type.size.md, fontWeight: type.weight.heavy, color: colors.ink },
  meta: { fontSize: type.size.xs, color: colors.muted, marginTop: 2 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.ocean,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  ctaText: { fontSize: type.size.sm, fontWeight: type.weight.heavy, color: colors.white },
});
