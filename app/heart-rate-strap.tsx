import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  chooseStrap,
  forgetStrap,
  holdConnection,
  loadSavedStrap,
  scanForStraps,
  stopScan,
  useHeartRateStrap,
  type StrapStatus,
} from "@/services/heartRateStrap";
import { Button } from "@/ui/Button";
import { colors, radii, spacing, type } from "@/ui/theme";

/**
 * Pair a Bluetooth heart-rate chest strap for phone recordings.
 *
 * While this screen is open it holds the strap connection, so a paired strap
 * shows a live reading — the quickest way for someone to confirm it works
 * before they're on the water.
 */
export default function HeartRateStrapScreen() {
  const saved = useHeartRateStrap((s) => s.saved);
  const status = useHeartRateStrap((s) => s.status);
  const bpm = useHeartRateStrap((s) => s.bpm);
  const contact = useHeartRateStrap((s) => s.contact);
  const lastReadingAt = useHeartRateStrap((s) => s.lastReadingAt);
  const scanning = useHeartRateStrap((s) => s.scanning);
  const found = useHeartRateStrap((s) => s.found);
  // Ticks once a second so a reading that has gone stale stops showing.
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    void loadSavedStrap();
    const release = holdConnection();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(tick);
      void stopScan();
      release();
    };
  }, []);

  const fresh = bpm != null && now - lastReadingAt < 5000;

  const onForget = () => {
    if (!saved) return;
    Alert.alert("Forget strap?", `ImuaTrak will stop connecting to ${saved.name}.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Forget", style: "destructive", onPress: () => void forgetStrap() },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        {saved ? (
          <View style={styles.card}>
            <Text style={styles.label}>YOUR STRAP</Text>
            <Text style={styles.strapName}>{saved.name}</Text>
            <Text style={styles.status}>{statusText(status, contact)}</Text>
            <View style={styles.liveRow}>
              <Ionicons name="heart" size={28} color={colors.coral} />
              <Text style={styles.liveValue}>{fresh ? bpm : "—"}</Text>
              <Text style={styles.liveUnit}>bpm</Text>
            </View>
            <Text style={styles.hint}>
              It connects by itself whenever you record a paddle on this phone.
            </Text>
            <Button title="Forget strap" variant="danger" onPress={onForget} />
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.label}>NO STRAP PAIRED</Text>
            <Text style={styles.body}>
              Pair a Bluetooth chest strap to record heart rate when you paddle with just your
              phone. Works with Garmin HRM-Dual, HRM-Pro, HRM-Fit and HRM 600, plus Polar, Wahoo
              and other Bluetooth straps.
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.label}>{saved ? "SWITCH STRAP" : "FIND YOUR STRAP"}</Text>
          <Text style={styles.body}>
            Put the strap on first. Most straps, Garmin's included, only switch on when they
            touch skin, and damp pads help them pick up a signal.
          </Text>
          <Button
            title={scanning ? "Searching…" : "Search for straps"}
            onPress={() => void scanForStraps()}
            disabled={scanning}
          />
          {scanning && found.length === 0 && (
            <ActivityIndicator color={colors.ocean} style={{ marginTop: spacing.sm }} />
          )}
          {found.map((f) => (
            <Pressable
              key={f.id}
              style={styles.foundRow}
              onPress={() => void chooseStrap(f)}
            >
              <Ionicons name="heart-outline" size={20} color={colors.coral} />
              <View style={{ flex: 1 }}>
                <Text style={styles.foundName}>{f.name}</Text>
                <Text style={styles.foundMeta}>{signalLabel(f.rssi)}</Text>
              </View>
              {saved?.id === f.id ? (
                <Ionicons name="checkmark-circle" size={22} color={colors.seafoam} />
              ) : (
                <Text style={styles.useText}>Use</Text>
              )}
            </Pressable>
          ))}
          {!scanning && found.length === 0 && status !== "idle" && status !== "connected" && (
            <Text style={styles.status}>{statusText(status, contact)}</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>GOOD TO KNOW</Text>
          {Platform.OS === "ios" && (
            <Text style={styles.body}>
              • Recording on an Apple Watch? Pair the strap to the watch instead (Watch
              Settings → Bluetooth) and the watch app will use it automatically.
            </Text>
          )}
          <Text style={styles.body}>
            • Older straps that only use ANT+, such as Garmin's HRM-Run and HRM-Tri, can't
            connect to a phone.
          </Text>
          <Text style={styles.body}>
            • Bluetooth doesn't travel through water. If you huli, heart rate drops out and comes
            back by itself once the strap is above water.
          </Text>
          <Text style={styles.body}>
            • Some straps allow only one Bluetooth connection. If it won't connect, check it isn't
            connected to another app or gym machine.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function statusText(status: StrapStatus, contact: boolean | null): string {
  switch (status) {
    case "connected":
      return contact === false ? "Connected · no skin contact — wet the pads" : "Connected";
    case "connecting":
      return "Connecting…";
    case "reconnecting":
      return "Looking for the strap — make sure you're wearing it";
    case "bluetoothOff":
      return "Bluetooth is off. Turn it on to connect.";
    case "noPermission":
      return "ImuaTrak needs Bluetooth permission. You can allow it in Settings.";
    default:
      return "Not connected";
  }
}

function signalLabel(rssi: number): string {
  if (rssi >= -60) return "Strong signal";
  if (rssi >= -80) return "Good signal";
  return "Weak signal — move closer";
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 60 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  label: {
    fontSize: type.size.xs,
    fontWeight: type.weight.heavy,
    color: colors.muted,
    letterSpacing: 0.8,
  },
  strapName: { fontSize: type.size.xl, fontWeight: type.weight.heavy, color: colors.ink },
  status: { fontSize: type.size.sm, color: colors.muted },
  body: { fontSize: type.size.sm, color: colors.ink, lineHeight: 20 },
  hint: { fontSize: type.size.xs, color: colors.muted },
  liveRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, marginVertical: spacing.sm },
  liveValue: { fontSize: 48, fontWeight: type.weight.heavy, color: colors.ink },
  liveUnit: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.muted },
  foundRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  foundName: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink },
  foundMeta: { fontSize: type.size.xs, color: colors.muted },
  useText: { fontSize: type.size.sm, fontWeight: type.weight.heavy, color: colors.ocean },
});
