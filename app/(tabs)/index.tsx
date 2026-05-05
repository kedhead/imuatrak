import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { list, type StoredSession } from "@/services/storage";
import { formatDuration, formatKm } from "@/ui/format";
import { colors, radii, spacing } from "@/ui/theme";

export default function HomeTab() {
  const [sessions, setSessions] = useState<StoredSession[]>([]);

  useFocusEffect(
    useCallback(() => {
      void list().then(setSessions);
    }, []),
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>ImuaTrak</Text>
        <Pressable
          style={styles.recordButton}
          onPress={() => router.push("/record")}
          accessibilityLabel="Start recording"
        >
          <Ionicons name="play" size={16} color="#fff" />
          <Text style={styles.recordButtonLabel}>Record</Text>
        </Pressable>
      </View>

      {sessions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No sessions yet</Text>
          <Text style={styles.emptyBody}>Tap Record to start your first paddle.</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(s) => s.session.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          renderItem={({ item }) => <SessionRow stored={item} />}
        />
      )}
    </SafeAreaView>
  );
}

function SessionRow({ stored }: { stored: StoredSession }) {
  const s = stored.session;
  return (
    <Pressable style={styles.card} onPress={() => router.push(`/session/${s.id}`)}>
      <View>
        <Text style={styles.cardTitle}>
          {s.craftType} · {formatKm(s.totals.distanceMeters)} km
        </Text>
        <Text style={styles.cardSub}>
          {formatDuration(s.totals.durationSec)} · {s.totals.strokeCount} strokes
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { fontSize: 28, fontWeight: "700", color: colors.ink },
  recordButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.blue,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
  },
  recordButtonLabel: { color: "#fff", fontWeight: "600" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.sm },
  emptyTitle: { fontSize: 20, fontWeight: "600", color: colors.ink },
  emptyBody: { color: colors.muted, textAlign: "center" },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: colors.ink },
  cardSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
