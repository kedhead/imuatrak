import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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

// Google Play requires a prominent disclosure shown BEFORE the location
// permission prompt, naming the background-location feature and requiring an
// affirmative tap. Shown once before the first recording; the flag records
// that the user has seen and accepted it.
const LOCATION_DISCLOSURE_KEY = "imuatrak.locationDisclosureAccepted";

export default function Record() {
  const recorder = useRecorder();
  const units = useSettings((s) => s.units);
  const [busy, setBusy] = useState(false);
  const [showDisclosure, setShowDisclosure] = useState(false);

  const beginRecording = async () => {
    try {
      await recorder.start();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Couldn't start", msg);
    }
  };

  const onStart = async () => {
    // Prominent disclosure gate: on the first ever start, show the disclosure
    // and hold the OS permission request until the user taps Continue.
    const accepted = await AsyncStorage.getItem(LOCATION_DISCLOSURE_KEY);
    if (accepted !== "1") {
      setShowDisclosure(true);
      return;
    }
    await beginRecording();
  };

  const onAcceptDisclosure = async () => {
    await AsyncStorage.setItem(LOCATION_DISCLOSURE_KEY, "1");
    setShowDisclosure(false);
    await beginRecording();
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

          {/* Live GPS status: the point counter keeps climbing ~1/s even when
              stationary (and while backgrounded), so persistent location is
              visibly demonstrable without moving. */}
          {recorder.isRecording && (
            <Text style={styles.gpsStatus}>
              {recorder.gpsPointCount > 0
                ? `GPS locked · ${recorder.gpsPointCount} point${recorder.gpsPointCount === 1 ? "" : "s"} · ±${Math.max(1, Math.round(recorder.gpsAccuracyM))} m`
                : "Acquiring GPS…"}
            </Text>
          )}

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

          <Text style={styles.backgroundHint}>
            {recorder.isRecording
              ? "GPS tracking continues in the background — lock your screen or stow your phone in the dry bag."
              : "Once you start, GPS keeps recording your route even with the screen locked or the app in the background."}
          </Text>
        </ScrollView>

        <Modal
          visible={showDisclosure}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDisclosure(false)}
        >
          <View style={styles.disclosureBackdrop}>
            <View style={styles.disclosureCard}>
              <Text style={styles.disclosureTitle}>Location & your route</Text>
              <Text style={styles.disclosureBody}>
                ImuaTrak collects location data to record your route, distance, and pace during a
                paddling session — <Text style={styles.disclosureEmphasis}>even when the app is in
                the background and the screen is off</Text>. Paddlers keep their phone stowed while
                on the water, so recording must keep running until you end the session.
              </Text>
              <Text style={styles.disclosureBody}>
                Location is collected only while a session you start is running, and it stops the
                moment you tap Stop. It is never used for advertising or shared with third parties.
              </Text>
              <Button title="Continue" gradient="aqua" onPress={onAcceptDisclosure} style={{ marginTop: spacing.md }} />
              <Pressable onPress={() => setShowDisclosure(false)} style={styles.disclosureCancel} hitSlop={8}>
                <Text style={styles.disclosureCancelText}>Not now</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

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
  gpsStatus: {
    color: "rgba(255,255,255,0.7)",
    fontSize: type.size.xs,
    textAlign: "center",
    fontWeight: type.weight.bold,
    letterSpacing: 0.5,
  },
  backgroundHint: {
    color: "rgba(255,255,255,0.55)",
    fontSize: type.size.xs,
    textAlign: "center",
    lineHeight: 17,
    paddingHorizontal: spacing.md,
  },
  actions: { flexDirection: "row", gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.xxl },
  disclosureBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  disclosureCard: {
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  disclosureTitle: {
    color: colors.ink,
    fontSize: type.size.lg,
    fontWeight: type.weight.heavy,
    marginBottom: spacing.xs,
  },
  disclosureBody: { color: colors.ink, fontSize: type.size.sm, lineHeight: 20 },
  disclosureEmphasis: { fontWeight: type.weight.heavy },
  disclosureCancel: { alignItems: "center", paddingVertical: spacing.sm, marginTop: spacing.xs },
  disclosureCancelText: { color: colors.muted, fontSize: type.size.sm, fontWeight: type.weight.bold },
});
