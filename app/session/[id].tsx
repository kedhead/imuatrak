import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import MapView, { Marker, Polyline, type LatLng } from "react-native-maps";
import { Metric } from "@/ui/Metric";
import { Button } from "@/ui/Button";
import { SplitsChart } from "@/ui/SplitsChart";
import { formatDuration, formatKm, formatPace } from "@/ui/format";
import { colors, radii, spacing } from "@/ui/theme";
import { gpxUriFor, load, type StoredSession } from "@/services/storage";
import { setSessionPublic } from "@/services/sync";

const PUBLIC_BASE_URL = "https://imuatrak.app";

export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [stored, setStored] = useState<StoredSession | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [togglingPublic, setTogglingPublic] = useState(false);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (!id) return;
    void load(id).then((s) => {
      setStored(s);
      setIsPublic(s?.session.isPublic ?? false);
    });
  }, [id]);

  // Fit the map to the recorded route once both the map and the track are
  // ready. `fitToCoordinates` pans + zooms in a single call.
  const coords: LatLng[] =
    stored?.track.map((p) => ({ latitude: p.lat, longitude: p.lon })) ?? [];

  useEffect(() => {
    if (coords.length < 2 || !mapRef.current) return;
    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
      animated: false,
    });
  }, [stored, coords]);

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

  const onTogglePublic = async (next: boolean) => {
    setTogglingPublic(true);
    try {
      await setSessionPublic(s, next);
      setIsPublic(next);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Couldn't update sharing", msg);
    } finally {
      setTogglingPublic(false);
    }
  };

  const onCopyLink = async () => {
    const url = `${PUBLIC_BASE_URL}/s/${s.id}`;
    await Clipboard.setStringAsync(url);
    Alert.alert("Link copied", url);
  };

  const start = coords[0];
  const end = coords[coords.length - 1];
  const initialRegion = start
    ? { latitude: start.latitude, longitude: start.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : undefined;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <Text style={styles.craft}>{s.craftType}</Text>

      <View style={styles.mapBox}>
        {coords.length >= 2 ? (
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={initialRegion}
            scrollEnabled
            zoomEnabled
            pitchEnabled={false}
            rotateEnabled={false}
            toolbarEnabled={false}
          >
            <Polyline coordinates={coords} strokeColor={colors.blue} strokeWidth={4} />
            {start && (
              <Marker coordinate={start} title="Start" pinColor="green" />
            )}
            {end && start !== end && (
              <Marker coordinate={end} title="End" pinColor="red" />
            )}
          </MapView>
        ) : (
          <View style={[styles.map, styles.mapPlaceholder]}>
            <Text style={{ color: colors.muted }}>No GPS data captured</Text>
          </View>
        )}
      </View>

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

      <Text style={styles.sectionLabel}>Splits</Text>
      <SplitsChart splits={s.splits} />

      <View style={styles.shareCard}>
        <View style={styles.shareRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.shareTitle}>Share publicly</Text>
            <Text style={styles.shareSub}>
              Anyone with the link can view this session at imuatrak.app/s/{s.id.slice(0, 8)}…
            </Text>
          </View>
          <Switch
            value={isPublic}
            onValueChange={onTogglePublic}
            disabled={togglingPublic}
          />
        </View>
        {isPublic && <Button title="Copy link" variant="outline" onPress={onCopyLink} />}
      </View>

      <Button title="Export GPX" onPress={onShare} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl },
  craft: { fontSize: 28, fontWeight: "700", color: colors.ink },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.muted,
    textTransform: "uppercase",
    marginTop: spacing.sm,
  },
  mapBox: {
    height: 280,
    borderRadius: radii.lg,
    overflow: "hidden",
    backgroundColor: colors.card,
  },
  map: { flex: 1 },
  mapPlaceholder: { alignItems: "center", justifyContent: "center" },
  shareCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  shareRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  shareTitle: { fontWeight: "600", color: colors.ink, fontSize: 15 },
  shareSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
