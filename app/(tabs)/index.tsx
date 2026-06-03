import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Platform, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { list, type StoredSession } from "@/services/storage";
import { syncSession } from "@/services/sync";
import { watchAuth } from "@/services/auth";
import { useSettings } from "@/services/settings";
import { WatchBridge } from "@imuatrak/watch-bridge";
import { WearBridge } from "@imuatrak/wear-bridge";
import { AnimatedPressable } from "@/ui/AnimatedPressable";
import { Badge } from "@/ui/Badge";
import { Gradient } from "@/ui/Gradient";
import { GradientCard } from "@/ui/GradientCard";
import { GradientHeader } from "@/ui/GradientHeader";
import { Logo } from "@/ui/Logo";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { formatDate, formatDistance, formatDuration } from "@/ui/format";
import { colors, craftColor, radii, shadow, spacing, type } from "@/ui/theme";

function thisWeekMonday(): Date {
  const now = new Date();
  const day = now.getDay(); // 0 = Sun
  const diff = (day === 0 ? -6 : 1 - day);
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

export default function HomeTab() {
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const units = useSettings((s) => s.units);
  const weeklyGoalDistanceKm = useSettings((s) => s.weeklyGoalDistanceKm);
  const weeklyGoalDurationMin = useSettings((s) => s.weeklyGoalDurationMin);

  const reload = useCallback(() => { void list().then(setSessions); }, []);

  useFocusEffect(reload);

  // When the user signs in, push any locally-stored sessions that never made
  // it to Firestore (recorded offline, before sign-in, or before sync existed).
  // syncSession is idempotent so re-syncing already-uploaded sessions is safe.
  useEffect(() => {
    return watchAuth((user) => {
      if (!user) return;
      list().then((stored) => {
        for (const { session } of stored) {
          void syncSession(session).catch(() => undefined);
        }
      }).catch(() => undefined);
    });
  }, []);

  // Receive sessions transferred from Apple Watch (iOS) or Wear OS (Android)
  useEffect(() => {
    const handleReceived = async ({ id }: { id: string }) => {
      const { load } = await import("@/services/storage");
      const stored = await load(id);
      if (stored) {
        try { await syncSession(stored.session); } catch { /* non-critical */ }
      }
      reload();
    };
    const sub = Platform.OS === "ios"
      ? WatchBridge.addListener("sessionReceived", handleReceived)
      : WearBridge.addListener("sessionReceived", handleReceived);
    return sub.remove;
  }, [reload]);

  const hasGoal = weeklyGoalDistanceKm > 0 || weeklyGoalDurationMin > 0;
  const monday = thisWeekMonday();
  const thisWeekSessions = sessions.filter((s) => new Date(s.session.startedAt) >= monday);
  const weekDistKm = thisWeekSessions.reduce((sum, s) => sum + s.session.totals.distanceMeters / 1000, 0);
  const weekDurMin = thisWeekSessions.reduce((sum, s) => sum + s.session.totals.durationSec / 60, 0);

  return (
    <ScreenBackground>
      <GradientHeader
        title="ImuaTrak"
        subtitle={sessions.length > 0 ? `${sessions.length} paddle${sessions.length === 1 ? "" : "s"} logged` : "Imua — move forward"}
        right={<RecordButton />}
      />

      {sessions.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(s) => s.session.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }}
          ListHeaderComponent={
            hasGoal ? (
              <WeeklyGoalCard
                distKm={weekDistKm}
                durMin={weekDurMin}
                goalDistKm={weeklyGoalDistanceKm}
                goalDurMin={weeklyGoalDurationMin}
                units={units}
              />
            ) : null
          }
          renderItem={({ item, index }) => <SessionRow stored={item} units={units} index={index} />}
        />
      )}
    </ScreenBackground>
  );
}

function WeeklyGoalCard({
  distKm,
  durMin,
  goalDistKm,
  goalDurMin,
  units,
}: {
  distKm: number;
  durMin: number;
  goalDistKm: number;
  goalDurMin: number;
  units: "metric" | "imperial";
}) {
  const distProgress = goalDistKm > 0 ? Math.min(distKm / goalDistKm, 1) : null;
  const durProgress = goalDurMin > 0 ? Math.min(durMin / goalDurMin, 1) : null;

  const distLabel = units === "imperial"
    ? `${(distKm * 0.621371).toFixed(1)} / ${(goalDistKm * 0.621371).toFixed(0)} mi`
    : `${distKm.toFixed(1)} / ${goalDistKm} km`;
  const durLabel = `${Math.round(durMin)} / ${goalDurMin} min`;

  return (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.goalCard}>
      <GradientCard gradient="ocean">
        <Text style={styles.goalTitle}>THIS WEEK</Text>
        {distProgress !== null && (
          <View style={styles.goalRow}>
            <View style={styles.goalMeta}>
              <Ionicons name="map-outline" size={14} color="rgba(255,255,255,0.7)" />
              <Text style={styles.goalLabel}>{distLabel}</Text>
            </View>
            <View style={styles.goalBar}>
              <View style={[styles.goalFill, { width: `${(distProgress * 100).toFixed(1)}%` }]} />
            </View>
          </View>
        )}
        {durProgress !== null && (
          <View style={[styles.goalRow, distProgress !== null && { marginTop: spacing.sm }]}>
            <View style={styles.goalMeta}>
              <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.7)" />
              <Text style={styles.goalLabel}>{durLabel}</Text>
            </View>
            <View style={styles.goalBar}>
              <View style={[styles.goalFill, { width: `${(durProgress * 100).toFixed(1)}%` }]} />
            </View>
          </View>
        )}
      </GradientCard>
    </Animated.View>
  );
}

function RecordButton() {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
  }, [scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style}>
      <AnimatedPressable
        haptic
        onPress={() => router.push("/record")}
        accessibilityLabel="Start recording"
        style={[styles.recordBtn, shadow.glowCoral]}
      >
        <Gradient name="sunrise" style={styles.recordFill}>
          <Ionicons name="play" size={18} color={colors.white} />
          <Text style={styles.recordLabel}>Record</Text>
        </Gradient>
      </AnimatedPressable>
    </Animated.View>
  );
}

function SessionRow({
  stored,
  units,
  index,
}: {
  stored: StoredSession;
  units: "metric" | "imperial";
  index: number;
}) {
  const s = stored.session;
  const accent = craftColor(s.craftType);
  return (
    <Animated.View entering={FadeInDown.delay(index * 70).duration(450)}>
      <GradientCard accent={accent} onPress={() => router.push(`/session/${s.id}`)}>
        <View style={styles.cardRow}>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={styles.cardTop}>
              <Badge label={s.craftType} color={accent} variant="soft" />
              <Text style={styles.cardDate}>{formatDate(s.startedAt)}</Text>
            </View>
            <Text style={styles.distance}>{formatDistance(s.totals.distanceMeters, units)}</Text>
            <Text style={styles.cardSub}>
              {formatDuration(s.totals.durationSec)} · {s.totals.strokeCount} strokes
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.muted} />
        </View>
      </GradientCard>
    </Animated.View>
  );
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyLogo}>
        <Gradient name="aqua" style={styles.emptyLogoFill}>
          <Logo size={88} />
        </Gradient>
      </View>
      <Text style={styles.emptyTitle}>Your first paddle awaits</Text>
      <Text style={styles.emptyBody}>
        Tap Record to start tracking distance, pace, and stroke rate out on the water.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  recordBtn: { borderRadius: radii.pill, overflow: "hidden" },
  recordFill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  recordLabel: { color: colors.white, fontWeight: type.weight.bold, fontSize: type.size.md },
  cardRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardDate: { fontSize: type.size.xs, color: colors.muted },
  distance: {
    fontSize: type.size.xxl,
    fontWeight: type.weight.heavy,
    color: colors.ink,
    ...type.mono,
  },
  cardSub: { fontSize: type.size.sm, color: colors.muted },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.md },
  emptyLogo: { borderRadius: radii.xxl, overflow: "hidden", ...shadow.glowAqua },
  emptyLogoFill: { padding: spacing.xl, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: type.size.xl, fontWeight: type.weight.heavy, color: colors.ink, marginTop: spacing.sm },
  emptyBody: { color: colors.muted, textAlign: "center", fontSize: type.size.md, lineHeight: 22 },
  goalCard: { marginBottom: spacing.md },
  goalTitle: { fontSize: type.size.xs, fontWeight: type.weight.heavy, color: "rgba(255,255,255,0.7)", letterSpacing: 1.2, marginBottom: spacing.sm },
  goalRow: {},
  goalMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  goalLabel: { fontSize: type.size.sm, color: colors.white, fontWeight: type.weight.bold },
  goalBar: { height: 6, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 3, overflow: "hidden" },
  goalFill: { height: 6, backgroundColor: colors.white, borderRadius: 3 },
});
