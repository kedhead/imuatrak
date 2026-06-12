import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { CRAFT_TYPES } from "@/models";
import { useRecorder } from "@/services/recorder";
import { useSettings } from "@/services/settings";
import { Button } from "@/ui/Button";
import { Pill } from "@/ui/Pill";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { formatDuration, formatDistance, formatPaceStr } from "@/ui/format";
import { colors, radii, spacing, type } from "@/ui/theme";

export default function Record() {
  const recorder = useRecorder();
  const units = useSettings((s) => s.units);
  const [busy, setBusy] = useState(false);

  const onStart = async () => {
    try {
      await recorder.start();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Couldn't start", msg);
    }
  };

  const onStop = async () => {
    setBusy(true);
    try {
      const session = await recorder.stopAndSave();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (router.canDismiss()) router.dismiss();
      else router.back();
      if (session) router.push(`/session/${session.id}`);
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onDiscard = () => {
    Alert.alert("Discard session?", "This recording will be deleted.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          recorder.discard();
          if (router.canDismiss()) router.dismiss();
          else router.back();
        },
      },
    ]);
  };

  const pace =
    recorder.currentSpeedMps > 0 ? formatPaceStr(1000 / recorder.currentSpeedMps, units) : "—";
  const strokeRate =
    recorder.currentStrokeRate > 0 ? `${Math.round(recorder.currentStrokeRate)}` : "—";

  return (
    <ScreenBackground gradient={recorder.isRecording ? "night" : "ocean"}>
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.craftRow}
          >
            {CRAFT_TYPES.map((c) => (
              <Pill
                key={c}
                label={c}
                selected={recorder.craftType === c}
                onPress={() => recorder.setCraftType(c)}
                gradient="aqua"
              />
            ))}
          </ScrollView>

          <StatusPill recording={recorder.isRecording} />

          {/* Hero metric */}
          <View style={styles.heroMetric}>
            <Text style={styles.heroValue}>{formatDistance(recorder.distanceMeters, units)}</Text>
            <Text style={styles.heroLabel}>DISTANCE</Text>
          </View>

          <View style={styles.grid}>
            <Tile label="TIME" value={formatDuration(recorder.durationSec)} />
            <Tile label="PACE" value={pace} accent={colors.aqua} />
            <Tile label="STROKE RATE" value={strokeRate} unit="spm" accent={colors.seafoam} />
            <Tile label="STROKES" value={recorder.strokeCount.toString()} accent={colors.gold} />
          </View>
        </ScrollView>

        {!recorder.isRecording && Platform.OS === "ios" && (
          <View style={styles.healthNote}>
            <Ionicons name="heart-circle" size={16} color="#FF2D55" />
            <Text style={styles.healthNoteText}>Saves this workout to Apple Health</Text>
          </View>
        )}

        <View style={styles.actions}>
          {recorder.isRecording ? (
            <>
              <Button title="Discard" variant="danger" onPress={onDiscard} style={styles.flex} />
              <Button
                title={busy ? "Saving…" : "Stop & save"}
                gradient="aqua"
                glow
                onPress={onStop}
                disabled={busy}
                style={styles.flex}
              />
            </>
          ) : (
            <Button title="Start paddling" gradient="sunrise" glow onPress={onStart} style={styles.flex} />
          )}
        </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

function StatusPill({ recording }: { recording: boolean }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (recording) {
      pulse.value = withRepeat(withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true);
    } else {
      pulse.value = withTiming(1);
    }
  }, [recording, pulse]);
  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View style={styles.statusWrap}>
      <Animated.View
        style={[styles.dot, { backgroundColor: recording ? colors.coral : colors.seafoam }, dotStyle]}
      />
      <Text style={styles.statusText}>{recording ? "RECORDING" : "READY"}</Text>
    </View>
  );
}

function Tile({
  label,
  value,
  unit,
  accent = colors.white,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: string;
}) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <View style={styles.tileValueRow}>
        <Text style={[styles.tileValue, { color: accent }]}>{value}</Text>
        {unit ? <Text style={styles.tileUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  craftRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  statusWrap: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  dot: { width: 12, height: 12, borderRadius: 6 },
  statusText: {
    color: colors.white,
    fontWeight: type.weight.heavy,
    letterSpacing: 2,
    fontSize: type.size.sm,
  },
  heroMetric: { alignItems: "center", paddingVertical: spacing.lg },
  heroValue: {
    color: colors.white,
    fontSize: 64,
    fontWeight: type.weight.heavy,
    letterSpacing: type.spacing.tight,
    ...type.mono,
  },
  heroLabel: {
    color: "rgba(255,255,255,0.7)",
    fontWeight: type.weight.bold,
    letterSpacing: 2,
    fontSize: type.size.sm,
    marginTop: 4,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: spacing.lg,
    gap: spacing.xs,
  },
  tileLabel: {
    color: "rgba(255,255,255,0.65)",
    fontWeight: type.weight.bold,
    letterSpacing: 1,
    fontSize: type.size.xs,
  },
  tileValueRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  tileValue: { fontSize: type.size.display, fontWeight: type.weight.heavy, ...type.mono },
  tileUnit: { color: "rgba(255,255,255,0.6)", fontSize: type.size.md, fontWeight: type.weight.bold },
  healthNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "center",
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  healthNoteText: { color: colors.white, fontSize: type.size.sm, fontWeight: type.weight.bold },
  actions: { flexDirection: "row", gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.xxl },
});
