import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { currentUser } from "@/services/auth";
import { getEvent, setRsvp, deleteEvent, createEvent } from "@/services/clubService";
import { useClub } from "@/services/clubStore";
import type { ClubEvent, EventType, RsvpStatus } from "@/models/club";
import { colors, spacing, radii } from "@/ui/theme";

const TYPE_COLOR: Record<string, string> = {
  practice: colors.blue,
  race: "#B22222",
  social: colors.teal,
};

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const club = useClub((s) => s.club);
  const role = useClub((s) => s.role);

  const isNew = id === "new";
  const isAdmin = role === "owner" || role === "admin" || role === "coach";

  if (isNew && isAdmin) {
    return <CreateEventForm clubId={club?.id ?? ""} onDone={() => router.back()} />;
  }

  return <EventDetail eventId={id} clubId={club?.id ?? ""} role={role} />;
}

// ── Event detail ──────────────────────────────────────────────────────────────

function EventDetail({
  eventId,
  clubId,
  role,
}: {
  eventId: string;
  clubId: string;
  role: string | null;
}) {
  const router = useRouter();
  const [event, setEvent] = useState<ClubEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [rsvpLoading, setRsvpLoading] = useState(false);

  const me = currentUser();
  const myRsvp = event?.rsvps.find((r) => r.uid === me?.uid)?.status ?? null;
  const isAdmin = role === "owner" || role === "admin";

  useEffect(() => {
    if (!clubId || !eventId) return;
    getEvent(clubId, eventId)
      .then(setEvent)
      .finally(() => setLoading(false));
  }, [clubId, eventId]);

  const handleRsvp = async (status: RsvpStatus) => {
    if (!clubId || !eventId || !me) return;
    setRsvpLoading(true);
    await setRsvp(clubId, eventId, me.uid, status);
    const updated = await getEvent(clubId, eventId);
    setEvent(updated);
    setRsvpLoading(false);
  };

  const handleDelete = () => {
    Alert.alert("Delete Event", "This cannot be undone.", [
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteEvent(clubId, eventId);
          router.back();
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.blue} /></View>;
  if (!event) return <View style={styles.center}><Text style={{ color: colors.muted }}>Event not found</Text></View>;

  const goingCount = event.rsvps.filter((r) => r.status === "going").length;
  const maybeCount = event.rsvps.filter((r) => r.status === "maybe").length;

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.typePill, { backgroundColor: TYPE_COLOR[event.type] ?? colors.blue }]}>
          <Text style={styles.typeText}>{event.type.toUpperCase()}</Text>
        </View>
        <Text style={styles.title}>{event.title}</Text>
        <Text style={styles.date}>{formatEventDate(event.startAt, event.endAt)}</Text>

        {event.location?.name && (
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={16} color={colors.muted} />
            <Text style={styles.infoText}>{event.location.name}</Text>
          </View>
        )}
        {event.meetTime && (
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={16} color={colors.muted} />
            <Text style={styles.infoText}>Meet at {event.meetTime}{event.meetLocation ? ` · ${event.meetLocation}` : ""}</Text>
          </View>
        )}

        {event.description && (
          <Text style={styles.description}>{event.description}</Text>
        )}

        {/* RSVP buttons */}
        <Text style={styles.sectionLabel}>YOUR RSVP</Text>
        <View style={styles.rsvpBtns}>
          {(["going", "maybe", "not_going"] as RsvpStatus[]).map((s) => (
            <Pressable
              key={s}
              style={[styles.rsvpBtn, myRsvp === s && styles.rsvpBtnActive, rsvpLoading && { opacity: 0.5 }]}
              onPress={() => handleRsvp(s)}
              disabled={rsvpLoading}
            >
              <Text style={[styles.rsvpBtnText, myRsvp === s && { color: "#fff" }]}>
                {rsvpLabel(s)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Attendance summary */}
        <Text style={styles.sectionLabel}>ATTENDANCE</Text>
        <View style={styles.attendanceRow}>
          <AttendanceStat label="Going" count={goingCount} color={colors.teal} />
          <AttendanceStat label="Maybe" count={maybeCount} color={colors.muted} />
        </View>

        {/* Linked sessions */}
        {event.linkedSessionIds.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>LINKED SESSIONS</Text>
            <Text style={styles.infoText}>{event.linkedSessionIds.length} session{event.linkedSessionIds.length !== 1 ? "s" : ""} recorded</Text>
          </>
        )}

        {isAdmin && (
          <Pressable style={styles.deleteBtn} onPress={handleDelete}>
            <Text style={styles.deleteBtnText}>Delete Event</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function AttendanceStat({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statCount, { color }]}>{count}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Create event form ─────────────────────────────────────────────────────────

function CreateEventForm({ clubId, onDone }: { clubId: string; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<EventType>("practice");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [locationName, setLocationName] = useState("");
  const [meetTime, setMeetTime] = useState("");
  const [loading, setLoading] = useState(false);

  const me = currentUser();

  const handleCreate = async () => {
    if (!title.trim() || !startDate.trim() || !startTime.trim()) {
      Alert.alert("Title, date, and time are required");
      return;
    }
    if (!me) return;
    setLoading(true);
    try {
      const startAt = new Date(`${startDate}T${startTime}`).toISOString();
      const endAt = new Date(new Date(startAt).getTime() + 2 * 60 * 60 * 1000).toISOString();
      await createEvent(clubId, me.uid, {
        title: title.trim(),
        type,
        description: description.trim() || undefined,
        startAt,
        endAt,
        location: locationName.trim() ? { name: locationName.trim() } : undefined,
        meetTime: meetTime.trim() || undefined,
      });
      onDone();
    } catch {
      Alert.alert("Error", "Failed to create event.");
    } finally {
      setLoading(false);
    }
  };

  const EVENT_TYPES: EventType[] = ["practice", "race", "social"];

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>EVENT TYPE</Text>
        <View style={styles.typeSelector}>
          {EVENT_TYPES.map((t) => (
            <Pressable
              key={t}
              style={[styles.typeSelectorBtn, type === t && { backgroundColor: TYPE_COLOR[t] ?? colors.blue }]}
              onPress={() => setType(t)}
            >
              <Text style={[styles.typeSelectorText, type === t && { color: "#fff" }]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>TITLE *</Text>
        <TextInput style={styles.input} placeholder="e.g. Morning Practice" placeholderTextColor={colors.muted} value={title} onChangeText={setTitle} />

        <Text style={styles.sectionLabel}>DATE * (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} placeholder="2026-06-15" placeholderTextColor={colors.muted} value={startDate} onChangeText={setStartDate} keyboardType="numbers-and-punctuation" />

        <Text style={styles.sectionLabel}>START TIME * (HH:MM)</Text>
        <TextInput style={styles.input} placeholder="07:00" placeholderTextColor={colors.muted} value={startTime} onChangeText={setStartTime} keyboardType="numbers-and-punctuation" />

        <Text style={styles.sectionLabel}>LOCATION</Text>
        <TextInput style={styles.input} placeholder="e.g. Keehi Lagoon" placeholderTextColor={colors.muted} value={locationName} onChangeText={setLocationName} />

        <Text style={styles.sectionLabel}>MEET TIME</Text>
        <TextInput style={styles.input} placeholder="e.g. 6:45 AM" placeholderTextColor={colors.muted} value={meetTime} onChangeText={setMeetTime} />

        <Text style={styles.sectionLabel}>DESCRIPTION</Text>
        <TextInput style={[styles.input, styles.multiline]} placeholder="Details…" placeholderTextColor={colors.muted} value={description} onChangeText={setDescription} multiline numberOfLines={3} />

        <Pressable style={[styles.createBtn, loading && { opacity: 0.6 }]} onPress={handleCreate} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Create Event</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatEventDate(startAt: string, _endAt: string): string {
  const start = new Date(startAt);
  return start.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) +
    " at " + start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function rsvpLabel(status: RsvpStatus): string {
  return { going: "✓ Going", maybe: "? Maybe", not_going: "✗ Can't go" }[status];
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: spacing.lg, gap: spacing.xs },
  typePill: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start", marginBottom: spacing.xs },
  typeText: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 1 },
  title: { fontSize: 26, fontWeight: "800", color: colors.ink },
  date: { fontSize: 15, color: colors.muted, marginBottom: spacing.xs },
  infoRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: 2 },
  infoText: { fontSize: 14, color: colors.muted },
  description: { fontSize: 15, color: colors.ink, lineHeight: 22, marginTop: spacing.md },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: colors.muted, letterSpacing: 1.2, marginTop: spacing.lg },
  rsvpBtns: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  rsvpBtn: { flex: 1, borderWidth: 1.5, borderColor: colors.muted, borderRadius: radii.md, paddingVertical: spacing.sm, alignItems: "center" },
  rsvpBtnActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  rsvpBtnText: { fontWeight: "600", color: colors.ink, fontSize: 13 },
  attendanceRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  statCard: { flex: 1, backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.md, alignItems: "center" },
  statCount: { fontSize: 28, fontWeight: "800" },
  statLabel: { fontSize: 13, color: colors.muted, marginTop: 2 },
  deleteBtn: { marginTop: spacing.xxl, borderWidth: 1.5, borderColor: colors.danger, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: "center" },
  deleteBtnText: { color: colors.danger, fontWeight: "700", fontSize: 15 },
  typeSelector: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  typeSelectorBtn: { flex: 1, borderWidth: 1.5, borderColor: colors.muted, borderRadius: radii.md, paddingVertical: spacing.sm, alignItems: "center" },
  typeSelectorText: { fontWeight: "600", color: colors.muted, fontSize: 14 },
  input: { backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.md, fontSize: 16, color: colors.ink, marginTop: spacing.xs },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  createBtn: { backgroundColor: colors.blue, borderRadius: radii.md, paddingVertical: spacing.md + 2, alignItems: "center", marginTop: spacing.xl },
  createBtnText: { color: "#fff", fontWeight: "700", fontSize: 17 },
});
