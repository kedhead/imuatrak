import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import type { Split } from "@/models";
import { Gradient } from "./Gradient";
import { colors, radii, spacing, type } from "./theme";

interface Props {
  splits: Split[];
  imperial?: boolean;
}

/**
 * Horizontal bar chart of split paces. Bar widths are proportional to the
 * slowest split — faster splits render shorter, which matches how runners
 * and paddlers read pace ("less is better"). The fastest split is highlighted.
 */
export function SplitsChart({ splits, imperial = false }: Props) {
  if (splits.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={{ color: colors.muted }}>
          No full {imperial ? "mile" : "km"} splits yet.
        </Text>
      </View>
    );
  }

  const slowest = splits.reduce((m, s) => (s.durationSec > m ? s.durationSec : m), 0);
  const fastest = splits.reduce((m, s) => (s.durationSec < m ? s.durationSec : m), Infinity);
  let elapsed = 0;
  const unit = imperial ? "mi" : "km";

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.headerCell}>{unit}</Text>
        <Text style={[styles.headerCell, { flex: 1 }]}>Pace</Text>
        <Text style={styles.headerCellRight}>Total</Text>
      </View>
      {splits.map((s, i) => {
        elapsed += s.durationSec;
        const pct = slowest > 0 ? (s.durationSec / slowest) * 100 : 0;
        const isFastest = s.durationSec === fastest;
        return (
          <View key={s.index} style={styles.row}>
            <Text style={styles.indexCell}>{s.index}</Text>
            <View style={styles.barTrack}>
              <Bar pct={pct} delay={i * 60} fastest={isFastest} />
              <Text style={styles.barLabel}>{formatPace(s.durationSec)}</Text>
            </View>
            <Text style={styles.totalCell}>{formatHms(elapsed)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Bar({ pct, delay, fastest }: { pct: number; delay: number; fastest: boolean }) {
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withDelay(delay, withTiming(pct, { duration: 500, easing: Easing.out(Easing.cubic) }));
  }, [pct, delay, width]);
  const style = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  return (
    <Animated.View style={[styles.barFill, style]}>
      <Gradient name={fastest ? "coral" : "aqua"} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

function formatPace(secPerUnit: number): string {
  const s = Math.max(0, Math.floor(secPerUnit));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function formatHms(sec: number): string {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  empty: { padding: spacing.lg, alignItems: "center" },
  headerRow: { flexDirection: "row", paddingHorizontal: spacing.sm, paddingBottom: spacing.xs },
  headerCell: { color: colors.muted, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
  headerCellRight: {
    color: colors.muted,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    width: 64,
    textAlign: "right",
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  indexCell: { width: 24, textAlign: "center", color: colors.muted, ...type.mono },
  barTrack: {
    flex: 1,
    height: 28,
    backgroundColor: colors.bg,
    borderRadius: radii.sm,
    overflow: "hidden",
    justifyContent: "center",
  },
  barFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: radii.sm, overflow: "hidden" },
  barLabel: {
    paddingHorizontal: spacing.sm,
    fontWeight: type.weight.bold,
    color: colors.ink,
    ...type.mono,
  },
  totalCell: { width: 64, textAlign: "right", color: colors.muted, ...type.mono },
});
