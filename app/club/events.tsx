import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, SectionList, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useClub } from "@/services/clubStore";
import { getUpcomingEvents, getPastEvents } from "@/services/clubService";
import type { ClubEvent } from "@/models/club";
import { AnimatedPressable } from "@/ui/AnimatedPressable";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { GradientHeader } from "@/ui/GradientHeader";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, radii, shadow, spacing, type } from "@/ui/theme";

const TYPE_COLOR: Record<string, string> = {
  practice: colors.ocean,
  race: colors.coral,
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

  const sections = [
    ...(upcoming.length > 0 ? [{ title: "UPCOMING", data: upcoming }] : []),
    ...(past.length > 0 ? [{ title: "PAST", data: past }] : []),
  ];

  return (
    <ScreenBackground>
      <GradientHeader
        title="Events"
        subtitle={club.name}
        right={
          isAdmin ? (
            <View style={{ flexDirection: "row", gap: 12 }}>
              <AnimatedPressable onPress={() => router.push("/club/admin/bulk-schedule" as never)} hitSlop={8}>
                <Ionicons name="calendar" size={26} color={colors.white} />
              </AnimatedPressable>
              <AnimatedPressable onPress={() => router.push("/club/event/new" as never)} hitSlop={8}>
                <Ionicons name="add-circle" size={28} color={colors.white} />
              </AnimatedPressable>
            </View>
          ) : undefined
        }
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.ocean} />
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="calendar-outline" size={56} color={colors.muted} />
          <Text style={styles.emptyTitle}>No events yet</Text>
          {isAdmin && (
            <Button
              title="Create first event"
              gradient="aqua"
              onPress={() => router.push("/club/event/new" as never)}
              style={{ marginTop: spacing.lg }}
            />
          )}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionLabel}>{section.title}</Text>
          )}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 50).duration(400)}>
              <EventCard event={item} onPress={() => router.push(`/club/event/${item.id}` as never)} />
            </Animated.View>
          )}
        />
      )}
    </ScreenBackground>
  );
}

function EventCard({ event, onPress }: { event: ClubEvent; onPress: () => void }) {
  const color = TYPE_COLOR[event.type] ?? colors.ocean;
  const goingCount = event.rsvps.filter((r) => r.status === "going").length;
  const capacity = event.maxParticipants;
  const spotsLeft = capacity != null ? capacity - goingCount : null;

  return (
    <AnimatedPressable onPress={onPress} style={styles.card}>
      <View style={[styles.typeBar, { backgroundColor: color }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Badge label={event.type} color={color} variant="soft" />
          {spotsLeft != null && (
            <Text style={[styles.spots, spotsLeft <= 0 && { color: colors.coral }]}>
              {spotsLeft <= 0 ? "Full" : `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left`}
            </Text>
          )}
        </View>
        <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={13} color={colors.muted} />
          <Text style={styles.metaText}>{formatDate(event.startAt)}</Text>
        </View>
        {event.location?.name && (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color={colors.muted} />
            <Text style={styles.metaText}>{event.location.name}</Text>
          </View>
        )}
        <View style={styles.rsvpRow}>
          {goingCount > 0 && (
            <Text style={styles.rsvpChip}>✓ {goingCount} going</Text>
          )}
          {event.rsvps.filter((r) => r.status === "maybe").length > 0 && (
            <Text style={styles.rsvpChip}>
              ? {event.rsvps.filter((r) => r.status === "maybe").length} maybe
            </Text>
          )}
          {(event.boatAssignments?.length ?? 0) > 0 && (
            <Text style={styles.rsvpChip}>
              🚣 {event.boatAssignments!.length} boat{event.boatAssignments!.length !== 1 ? "s" : ""}
            </Text>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} style={{ alignSelf: "center" }} />
    </AnimatedPressable>
  );
}

function formatDate(startAt: string): string {
  const d = new Date(startAt);
  return (
    d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md, padding: spacing.xl },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 120 },
  sectionLabel: {
    fontSize: type.size.xs,
    fontWeight: type.weight.heavy,
    color: colors.muted,
    letterSpacing: type.spacing.label,
    textTransform: "uppercase",
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptyTitle: { fontSize: type.size.lg, color: colors.muted, fontWeight: type.weight.bold },
  card: {
    flexDirection: "row",
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    overflow: "hidden",
    ...shadow.sm,
  },
  typeBar: { width: 5 },
  cardBody: { flex: 1, padding: spacing.md, gap: spacing.xs },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: type.size.md, fontWeight: type.weight.heavy, color: colors.ink },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: type.size.xs, color: colors.muted },
  rsvpRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", marginTop: 2 },
  rsvpChip: { fontSize: type.size.xs, color: colors.muted },
  spots: { fontSize: type.size.xs, fontWeight: type.weight.bold, color: colors.ocean },
});
