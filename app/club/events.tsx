import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useClub } from "@/services/clubStore";
import { getUpcomingEvents, getPastEvents } from "@/services/clubService";
import type { ClubEvent } from "@/models/club";
import { colors, spacing, radii } from "@/ui/theme";

const TYPE_COLOR: Record<string, string> = {
  practice: colors.blue,
  race: "#B22222",
  social: colors.teal,
};

export default function EventsScreen() {
  const router = useRouter();
  const club = useClub((s) => s.club);
  const role = useClub((s) => s.role);
  const [upcoming, setUpcoming] = useState<ClubEvent[]>([]);
  const [past, setPast] = useState<ClubEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const clubId = club?.id;
  useEffect(() => {
    if (!clubId) return;
    Promise.all([getUpcomingEvents(clubId, 20), getPastEvents(clubId, 20)])
      .then(([u, p]) => { setUpcoming(u); setPast(p); })
      .finally(() => setLoading(false));
  }, [clubId]);

  const isAdmin = role === "owner" || role === "admin" || role === "coach";

  if (!club) return null;
  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.blue} /></View>;

  const sections = [
    ...(upcoming.length > 0 ? [{ title: "UPCOMING", data: upcoming }] : []),
    ...(past.length > 0 ? [{ title: "PAST", data: past }] : []),
  ];

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <SectionList
        sections={sections}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionLabel}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/club/event/${item.id}` as never)}>
            <View style={[styles.typePill, { backgroundColor: TYPE_COLOR[item.type] ?? colors.blue }]}>
              <Text style={styles.typeText}>{item.type.toUpperCase()}</Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.date}>{formatEventDate(item.startAt, item.endAt)}</Text>
            {item.location?.name && (
              <View style={styles.loc}>
                <Ionicons name="location-outline" size={13} color={colors.muted} />
                <Text style={styles.locText}>{item.location.name}</Text>
              </View>
            )}
            <View style={styles.rsvpRow}>
              {["going", "maybe", "not_going"].map((s) => {
                const count = item.rsvps.filter((r) => r.status === s).length;
                return count > 0 ? (
                  <Text key={s} style={styles.rsvpCount}>
                    {rsvpLabel(s as never)} {count}
                  </Text>
                ) : null;
              })}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="calendar-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyText}>No events yet</Text>
          </View>
        }
      />
      {isAdmin && (
        <Pressable style={styles.fab} onPress={() => router.push("/club/event/new" as never)}>
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
      )}
    </SafeAreaView>
  );
}

function formatEventDate(startAt: string, _endAt: string): string {
  const start = new Date(startAt);
  const dateStr = start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const timeStr = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${dateStr} · ${timeStr}`;
}

function rsvpLabel(status: "going" | "maybe" | "not_going"): string {
  return { going: "✓ Going", maybe: "? Maybe", not_going: "✗ Can't" }[status];
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md, padding: spacing.xl },
  list: { padding: spacing.lg, gap: spacing.sm },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: colors.muted, letterSpacing: 1.2, marginTop: spacing.lg, marginBottom: spacing.xs },
  card: { backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.md, gap: spacing.xs },
  typePill: { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2, alignSelf: "flex-start" },
  typeText: { fontSize: 9, fontWeight: "800", color: "#fff", letterSpacing: 1 },
  title: { fontSize: 16, fontWeight: "700", color: colors.ink },
  date: { fontSize: 13, color: colors.muted },
  loc: { flexDirection: "row", alignItems: "center", gap: 3 },
  locText: { fontSize: 13, color: colors.muted },
  rsvpRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
  rsvpCount: { fontSize: 12, color: colors.muted },
  emptyText: { fontSize: 16, color: colors.muted },
  fab: { position: "absolute", bottom: spacing.xl, right: spacing.xl, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.blue, justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 5 },
});
