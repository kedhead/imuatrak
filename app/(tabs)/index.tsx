import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
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
import { useSettings } from "@/services/settings";
import { AnimatedPressable } from "@/ui/AnimatedPressable";
import { Badge } from "@/ui/Badge";
import { Gradient } from "@/ui/Gradient";
import { GradientCard } from "@/ui/GradientCard";
import { GradientHeader } from "@/ui/GradientHeader";
import { Logo } from "@/ui/Logo";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { formatDate, formatDistance, formatDuration } from "@/ui/format";
import { colors, craftColor, radii, shadow, spacing, type } from "@/ui/theme";

export default function HomeTab() {
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const units = useSettings((s) => s.units);

  useFocusEffect(
    useCallback(() => {
      void list().then(setSessions);
    }, []),
  );

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
          renderItem={({ item, index }) => <SessionRow stored={item} units={units} index={index} />}
        />
      )}
    </ScreenBackground>
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
});
