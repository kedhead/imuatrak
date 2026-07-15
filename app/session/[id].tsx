import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import MapView, { Marker, Polyline, type LatLng } from "react-native-maps";
import { AnimatedNumber } from "@/ui/AnimatedNumber";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { Gradient } from "@/ui/Gradient";
import { GradientCard } from "@/ui/GradientCard";
import { Metric } from "@/ui/Metric";
import { SplitsChart } from "@/ui/SplitsChart";
import { formatDate, formatTime, formatDistance, formatPaceStr, formatDuration } from "@/ui/format";
import { colors, craftColor, radii, shadow, spacing, type } from "@/ui/theme";
import { gpxUriFor, load, type StoredSession } from "@/services/storage";
import { useSettings } from "@/services/settings";
import { deleteSession, setSessionPublic } from "@/services/sync";
import { emptyTotals, emptyHr } from "@/models";

const PUBLIC_BASE_URL = "https://imuatrak.app";

export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [stored, setStored] = useState<StoredSession | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [togglingPublic, setTogglingPublic] = useState(false);
  const mapRef = useRef<MapView>(null);
  const units = useSettings((s) => s.units);

  useEffect(() => {
    if (!id) return;
    load(id)
      .then((s) => {
        setStored(s);
        setIsPublic(s?.session.isPublic ?? false);
      })
      .catch(() => setStored(null));
  }, [id]);

  const coords: LatLng[] = useMemo(
    () => (stored?.track ?? []).map((p) => ({ latitude: p.lat, longitude: p.lon })),
    [stored],
  );

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
  const totals = s.totals ?? emptyTotals();
  const hr = s.hr ?? emptyHr();
  const splits = s.splits ?? [];
  const accent = craftColor(s.craftType);

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

  const onDelete = () => {
    Alert.alert(
      "Delete session?",
      "This will permanently remove the session from your device and the cloud. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteSession(s);
              router.back();
            } catch (e) {
              Alert.alert("Error", e instanceof Error ? e.message : "Could not delete session.");
            }
          },
        },
      ],
    );
  };

  const start = coords[0];
  const end = coords[coords.length - 1];
  const initialRegion = start
    ? { latitude: start.latitude, longitude: start.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : undefined;

  return (
    <>
      <Stack.Screen options={{ title: s.craftType }} />
      <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        {/* Hero summary */}
        <Animated.View entering={FadeInDown.duration(450)}>
          <GradientCard gradient="ocean">
            <View style={{ flexDirection: "row", gap: spacing.xs }}>
              {s.craftType && <Badge label={s.craftType} color="rgba(255,255,255,0.25)" />}
              {(s.source === "ios-watch" || s.source === "android-wear" || s.source === "gpx-import") && (
                <Badge
                  label={
                    s.source === "ios-watch"
                      ? "Apple Watch"
                      : s.source === "android-wear"
                        ? "Wear OS"
                        : "Imported"
                  }
                  color="rgba(255,255,255,0.18)"
                />
              )}
            </View>
            <Text style={styles.heroDate}>
              {formatDate(s.startedAt)} · {formatTime(s.startedAt)}
            </Text>
            <View style={styles.heroStats}>
              <HeroStat
                value={totals.distanceMeters}
                format={(n) => formatDistance(n, units)}
                label="Distance"
              />
              <HeroStat
                value={totals.durationSec}
                format={(n) => formatDuration(n)}
                label="Time"
              />
              <HeroStat
                value={totals.avgPaceSecPerKm}
                format={(n) => formatPaceStr(n, units)}
                label="Avg pace"
              />
            </View>
          </GradientCard>
        </Animated.View>

        {/* Map */}
        <Animated.View entering={FadeInDown.delay(80).duration(450)} style={styles.mapBox}>
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
              <Polyline coordinates={coords} strokeColor={colors.aqua} strokeWidth={5} />
              {start && <Marker coordinate={start} title="Start" pinColor={colors.seafoam} />}
              {end && start !== end && <Marker coordinate={end} title="End" pinColor={colors.coral} />}
            </MapView>
          ) : (
            <View style={[styles.map, styles.mapPlaceholder]}>
              <Text style={{ color: colors.muted }}>No GPS data captured</Text>
            </View>
          )}
        </Animated.View>

        {/* Detailed metrics */}
        <Animated.View entering={FadeInDown.delay(140).duration(450)}>
          <GradientCard>
            <Metric
              label="Strokes"
              value={`${totals.strokeCount} · ${Math.round(totals.avgStrokeRate)} spm`}
              icon="repeat"
              accent={accent}
            />
            {hr.avg > 0 && (
              <Metric
                label="Avg heart rate"
                value={`${hr.avg} bpm`}
                icon="heart"
                accent={colors.coral}
              />
            )}
            <Metric
              label="Calories"
              value={totals.calories > 0 ? `${Math.round(totals.calories)} kcal` : "—"}
              icon="flame-outline"
              accent={colors.gold}
            />
          </GradientCard>
        </Animated.View>

        {/* Weather */}
        {s.weather && (
          <Animated.View entering={FadeInDown.delay(200).duration(450)}>
            <Text style={styles.sectionLabel}>Conditions</Text>
            <GradientCard>
              <Metric
                label={s.weather.end ? "Wind (start)" : "Wind"}
                value={`${Math.round(s.weather.start.windMps * 1.944)} kts @ ${s.weather.start.windDeg}°`}
                icon="navigate"
                accent={colors.aqua}
              />
              <Metric
                label={s.weather.end ? "Temp (start)" : "Temperature"}
                value={`${Math.round(s.weather.start.airTempC)}°C`}
                icon="thermometer-outline"
                accent={colors.gold}
              />
              {s.weather.start.conditions && (
                <Metric label="Conditions" value={s.weather.start.conditions} icon="cloud-outline" accent={colors.muted} />
              )}
              {s.weather.end && (
                <>
                  <Metric
                    label="Wind (end)"
                    value={`${Math.round(s.weather.end.windMps * 1.944)} kts @ ${s.weather.end.windDeg}°`}
                    icon="navigate-outline"
                    accent={colors.aqua}
                  />
                  <Metric
                    label="Temp (end)"
                    value={`${Math.round(s.weather.end.airTempC)}°C`}
                    icon="thermometer"
                    accent={colors.gold}
                  />
                </>
              )}
            </GradientCard>
          </Animated.View>
        )}

        {/* Splits */}
        <Animated.View entering={FadeInDown.delay(260).duration(450)}>
          <Text style={styles.sectionLabel}>Splits</Text>
          <GradientCard>
            <SplitsChart splits={splits} imperial={units === "imperial"} />
          </GradientCard>
        </Animated.View>

        {/* Share */}
        <Animated.View entering={FadeInDown.delay(320).duration(450)}>
          <GradientCard>
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
                trackColor={{ true: colors.aqua }}
              />
            </View>
            {isPublic && (
              <Button title="Copy link" variant="outline" onPress={onCopyLink} style={{ marginTop: spacing.md }} />
            )}
          </GradientCard>
        </Animated.View>

        <Button title="Export GPX" gradient="aqua" onPress={onShare} />
        <Button title="Delete session" variant="danger" onPress={onDelete} />
      </ScrollView>
    </>
  );
}

function HeroStat({
  value,
  format,
  label,
}: {
  value: number;
  format: (n: number) => string;
  label: string;
}) {
  return (
    <View style={styles.heroStat}>
      <AnimatedNumber value={value} format={format} style={styles.heroStatValue} />
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSoft },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl },
  heroDate: { color: "rgba(255,255,255,0.85)", fontSize: type.size.sm, marginTop: spacing.sm },
  heroStats: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.lg },
  heroStat: { flex: 1 },
  heroStatValue: {
    color: colors.white,
    fontSize: type.size.xl,
    fontWeight: type.weight.heavy,
    ...type.mono,
  },
  heroStatLabel: { color: "rgba(255,255,255,0.75)", fontSize: type.size.xs, marginTop: 2 },
  sectionLabel: {
    fontSize: type.size.xs,
    fontWeight: type.weight.heavy,
    letterSpacing: type.spacing.label,
    color: colors.muted,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  mapBox: { height: 280, borderRadius: radii.xl, overflow: "hidden", backgroundColor: colors.card, ...shadow.md },
  map: { flex: 1 },
  mapPlaceholder: { alignItems: "center", justifyContent: "center" },
  shareRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  shareTitle: { fontWeight: type.weight.bold, color: colors.ink, fontSize: type.size.md },
  shareSub: { color: colors.muted, fontSize: type.size.xs, marginTop: 2 },
});
