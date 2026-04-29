import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CRAFT_TYPES } from "@/models";
import { useRecorder } from "@/services/recorder";
import { Button } from "@/ui/Button";
import { Metric } from "@/ui/Metric";
import { formatDuration, formatKm, formatPace } from "@/ui/format";
import { colors, radii, spacing } from "@/ui/theme";

export default function Record() {
  const recorder = useRecorder();
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
      router.dismiss();
      if (session) router.push(`/session/${session.id}`);
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
          router.dismiss();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={styles.craftRow}>
          {CRAFT_TYPES.map((c) => (
            <Text
              key={c}
              onPress={() => recorder.setCraftType(c)}
              style={[styles.craft, recorder.craftType === c && styles.craftOn]}
            >
              {c}
            </Text>
          ))}
        </View>

        {recorder.isRecording ? (
          <Text style={styles.recordingLabel}>● RECORDING</Text>
        ) : (
          <Text style={styles.readyLabel}>READY</Text>
        )}

        <View>
          <Metric label="Distance" value={`${formatKm(recorder.distanceMeters)} km`} />
          <Metric label="Time" value={formatDuration(recorder.durationSec)} />
          <Metric
            label="Pace"
            value={
              recorder.currentSpeedMps > 0 ? formatPace(1000 / recorder.currentSpeedMps) : "—"
            }
          />
          <Metric
            label="Stroke rate"
            value={recorder.currentStrokeRate > 0 ? `${Math.round(recorder.currentStrokeRate)} spm` : "—"}
          />
          <Metric label="Strokes" value={recorder.strokeCount.toString()} />
        </View>
      </ScrollView>

      <View style={styles.actions}>
        {recorder.isRecording ? (
          <>
            <Button title="Discard" variant="danger" onPress={onDiscard} style={{ flex: 1 }} />
            <Button
              title={busy ? "Saving…" : "Stop & save"}
              onPress={onStop}
              disabled={busy}
              style={{ flex: 1 }}
            />
          </>
        ) : (
          <Button title="Start" onPress={onStart} style={{ flex: 1 }} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  craftRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    backgroundColor: "#EEF1F4",
    borderRadius: radii.sm,
    padding: spacing.xs,
  },
  craft: {
    flexGrow: 1,
    textAlign: "center",
    paddingVertical: 8,
    color: colors.muted,
    fontSize: 13,
  },
  craftOn: {
    backgroundColor: colors.card,
    color: colors.ink,
    fontWeight: "600",
    borderRadius: radii.sm,
    overflow: "hidden",
  },
  recordingLabel: {
    color: colors.teal,
    fontWeight: "700",
    letterSpacing: 1.5,
    textAlign: "center",
  },
  readyLabel: {
    color: colors.muted,
    fontWeight: "700",
    letterSpacing: 1.5,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
});
