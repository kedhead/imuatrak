import * as Sharing from "expo-sharing";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { Metric } from "@/ui/Metric";
import { Button } from "@/ui/Button";
import { formatDuration, formatKm, formatPace } from "@/ui/format";
import { colors, spacing } from "@/ui/theme";
import { gpxUriFor, load, type StoredSession } from "@/services/storage";

export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [stored, setStored] = useState<StoredSession | null>(null);

  useEffect(() => {
    if (!id) return;
    void load(id).then(setStored);
  }, [id]);

  if (!stored) {
    return (
      <View style={styles.empty}>
        <Text style={{ color: colors.muted }}>Session not found.</Text>
      </View>
    );
  }

  const s = stored.session;
  const onShare = async () => {
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert("Sharing not available on this device");
      return;
    }
    await Sharing.shareAsync(gpxUriFor(s.id), {
      mimeType: "application/gpx+xml",
      UTI: "com.topografix.gpx",
      dialogTitle: "Share GPX",
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <Text style={styles.craft}>{s.craftType}</Text>
      <View>
        <Metric label="Distance" value={`${formatKm(s.totals.distanceMeters)} km`} />
        <Metric label="Duration" value={formatDuration(s.totals.durationSec)} />
        <Metric label="Avg pace" value={formatPace(s.totals.avgPaceSecPerKm)} />
        <Metric
          label="Strokes"
          value={`${s.totals.strokeCount} (avg ${Math.round(s.totals.avgStrokeRate)} spm)`}
        />
        <Metric label="Avg HR" value={s.hr.avg > 0 ? `${s.hr.avg} bpm` : "—"} />
        <Metric label="Elev. gain" value={`${Math.round(s.totals.elevationGainM)} m`} />
      </View>
      <Button title="Export GPX" onPress={onShare} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl },
  craft: { fontSize: 28, fontWeight: "700", color: colors.ink },
});
