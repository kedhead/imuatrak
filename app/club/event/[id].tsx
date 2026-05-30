import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { currentUser } from "@/services/auth";
import {
  getEvent,
  setRsvp,
  deleteEvent,
  createEvent,
  updateBoatAssignments,
} from "@/services/clubService";
import { useClub } from "@/services/clubStore";
import type {
  BoatAssignment,
  ClubEvent,
  ClubMember,
  EventType,
  RsvpStatus,
} from "@/models/club";
import { AnimatedPressable } from "@/ui/AnimatedPressable";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { GradientCard } from "@/ui/GradientCard";
import { GradientHeader } from "@/ui/GradientHeader";
import { Pill } from "@/ui/Pill";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, radii, spacing, type } from "@/ui/theme";

const TYPE_COLOR: Record<string, string> = {
  practice: colors.ocean,
  race: colors.coral,
  social: colors.teal,
};

// ── Root ─────────────────────────────────────────────────────────────────────

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const club = useClub((s) => s.club);
  const role = useClub((s) => s.role);
  const members = useClub((s) => s.members);

  const isNew = id === "new";
  const isAdmin = role === "owner" || role === "admin" || role === "coach";

  if (isNew && isAdmin) {
    return (
      <ScreenBackground>
        <GradientHeader title="New Event" />
        <CreateEventForm clubId={club?.id ?? ""} onDone={() => router.back()} />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <EventDetail eventId={id} clubId={club?.id ?? ""} role={role} members={members} />
    </ScreenBackground>
  );
}

// ── Event detail ──────────────────────────────────────────────────────────────

function EventDetail({
  eventId,
  clubId,
  role,
  members,
}: {
  eventId: string;
  clubId: string;
  role: string | null;
  members: ClubMember[];
}) {
  const router = useRouter();
  const [event, setEvent] = useState<ClubEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ boatIdx: number; seatIdx: number } | null>(null);

  const me = currentUser();
  const myRsvp = event?.rsvps.find((r) => r.uid === me?.uid)?.status ?? null;
  const isAdmin = role === "owner" || role === "admin" || role === "coach";

  const goingUids = event?.rsvps.filter((r) => r.status === "going").map((r) => r.uid) ?? [];
  const goingCount = goingUids.length;
  const maybeCount = event?.rsvps.filter((r) => r.status === "maybe").length ?? 0;
  const atCapacity =
    event?.maxParticipants != null && goingCount >= event.maxParticipants && myRsvp !== "going";

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

  const handleAssignSeat = async (uid: string | null) => {
    if (!event || assignTarget === null) return;
    const boats: BoatAssignment[] = JSON.parse(JSON.stringify(event.boatAssignments ?? []));
    const boat = boats[assignTarget.boatIdx];
    const seat = boat?.seats[assignTarget.seatIdx];
    if (!boat || !seat) return;
    seat.uid = uid;
    setAssignTarget(null);
    await updateBoatAssignments(clubId, eventId, boats);
    const updated = await getEvent(clubId, eventId);
    setEvent(updated);
  };

  const handleAddBoat = async () => {
    if (!event) return;
    const boats: BoatAssignment[] = [...(event.boatAssignments ?? [])];
    boats.push({
      boatName: `Boat ${boats.length + 1}`,
      seats: Array.from({ length: 6 }, (_, i) => ({ seatNumber: i + 1, uid: null })),
    });
    await updateBoatAssignments(clubId, eventId, boats);
    const updated = await getEvent(clubId, eventId);
    setEvent(updated);
  };

  const memberByUid = (uid: string): ClubMember | undefined => members.find((m) => m.uid === uid);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ocean} />
      </View>
    );
  }
  if (!event) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.muted }}>Event not found</Text>
      </View>
    );
  }

  const boats = event.boatAssignments ?? [];

  return (
    <>
      <GradientHeader
        title={event.title}
        subtitle={formatEventDate(event.startAt)}
        right={
          isAdmin ? (
            <Pressable onPress={handleDelete} hitSlop={8}>
              <Ionicons name="trash-outline" size={22} color={colors.white} />
            </Pressable>
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Type + meta */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <GradientCard>
            <Badge label={event.type} color={TYPE_COLOR[event.type] ?? colors.ocean} />
            {event.location?.name && (
              <View style={styles.infoRow}>
                <Ionicons name="location-outline" size={15} color={colors.muted} />
                <Text style={styles.infoText}>{event.location.name}</Text>
              </View>
            )}
            {event.meetTime && (
              <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={15} color={colors.muted} />
                <Text style={styles.infoText}>
                  Meet {event.meetTime}
                  {event.meetLocation ? ` · ${event.meetLocation}` : ""}
                </Text>
              </View>
            )}
            {event.description ? (
              <Text style={styles.description}>{event.description}</Text>
            ) : null}
          </GradientCard>
        </Animated.View>

        {/* RSVP */}
        <Animated.View entering={FadeInDown.delay(60).duration(400)}>
          <Text style={styles.sectionLabel}>YOUR RSVP</Text>
          <GradientCard>
            <View style={styles.rsvpBtns}>
              {(["going", "maybe", "not_going"] as RsvpStatus[]).map((s) => (
                <Pressable
                  key={s}
                  style={[
                    styles.rsvpBtn,
                    myRsvp === s && { backgroundColor: TYPE_COLOR[event.type] ?? colors.ocean, borderColor: "transparent" },
                    s === "going" && atCapacity && styles.rsvpBtnDisabled,
                    rsvpLoading && { opacity: 0.5 },
                  ]}
                  onPress={() => handleRsvp(s)}
                  disabled={rsvpLoading || (s === "going" && atCapacity)}
                >
                  <Text style={[styles.rsvpBtnText, myRsvp === s && { color: colors.white }]}>
                    {rsvpLabel(s)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </GradientCard>
        </Animated.View>

        {/* Attendance */}
        <Animated.View entering={FadeInDown.delay(120).duration(400)}>
          <Text style={styles.sectionLabel}>ATTENDANCE</Text>
          <GradientCard>
            <View style={styles.attendanceRow}>
              <View style={styles.statCard}>
                <Text style={[styles.statCount, { color: colors.aqua }]}>{goingCount}</Text>
                <Text style={styles.statLabel}>
                  Going{event.maxParticipants ? ` / ${event.maxParticipants}` : ""}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statCount, { color: colors.muted }]}>{maybeCount}</Text>
                <Text style={styles.statLabel}>Maybe</Text>
              </View>
            </View>
            {goingUids.length > 0 && (
              <View style={styles.rosterWrap}>
                {goingUids.map((uid) => {
                  const m = memberByUid(uid);
                  const initial = (m?.displayName?.[0] ?? "?").toUpperCase();
                  return (
                    <View key={uid} style={styles.rosterChip}>
                      <View style={styles.rosterAvatar}>
                        <Text style={styles.rosterInitial}>{initial}</Text>
                      </View>
                      <Text style={styles.rosterName} numberOfLines={1}>
                        {m?.displayName ?? uid.slice(0, 6)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </GradientCard>
        </Animated.View>

        {/* Boat lineup */}
        {(boats.length > 0 || isAdmin) && (
          <Animated.View entering={FadeInDown.delay(180).duration(400)}>
            <Text style={styles.sectionLabel}>LINEUP</Text>
            {boats.map((boat, bi) => (
              <GradientCard key={bi} style={{ marginBottom: spacing.sm }}>
                <Text style={styles.boatName}>{boat.boatName}</Text>
                <View style={styles.seatsGrid}>
                  {boat.seats.map((seat, si) => {
                    const assignedMember = seat.uid ? memberByUid(seat.uid) : null;
                    const isMe = seat.uid === me?.uid;
                    return (
                      <AnimatedPressable
                        key={si}
                        style={[styles.seatChip, isMe && styles.seatChipMe]}
                        onPress={isAdmin ? () => setAssignTarget({ boatIdx: bi, seatIdx: si }) : undefined}
                      >
                        <Text style={styles.seatNum}>{seat.seatNumber}</Text>
                        <Text style={[styles.seatName, !assignedMember && { color: colors.muted }]} numberOfLines={1}>
                          {assignedMember ? assignedMember.displayName : "Empty"}
                        </Text>
                      </AnimatedPressable>
                    );
                  })}
                </View>
              </GradientCard>
            ))}
            {isAdmin && (
              <Button
                title="+ Add boat"
                variant="outline"
                onPress={handleAddBoat}
                style={{ marginTop: spacing.xs }}
              />
            )}
          </Animated.View>
        )}
      </ScrollView>

      {/* Seat assignment picker modal */}
      <Modal
        visible={assignTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setAssignTarget(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setAssignTarget(null)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Assign seat</Text>
            <ScrollView>
              <Pressable style={styles.assignRow} onPress={() => handleAssignSeat(null)}>
                <Ionicons name="close-circle-outline" size={20} color={colors.muted} />
                <Text style={[styles.assignName, { color: colors.muted }]}>Clear seat</Text>
              </Pressable>
              {goingUids.map((uid) => {
                const m = memberByUid(uid);
                return (
                  <Pressable key={uid} style={styles.assignRow} onPress={() => handleAssignSeat(uid)}>
                    <View style={[styles.rosterAvatar, { backgroundColor: colors.ocean }]}>
                      <Text style={styles.rosterInitial}>{(m?.displayName?.[0] ?? "?").toUpperCase()}</Text>
                    </View>
                    <Text style={styles.assignName}>{m?.displayName ?? uid.slice(0, 8)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ── Create event form ─────────────────────────────────────────────────────────

function CreateEventForm({ clubId, onDone }: { clubId: string; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState<EventType>("practice");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [meetTime, setMeetTime] = useState("");
  const [maxStr, setMaxStr] = useState("");
  const [numBoats, setNumBoats] = useState(0);
  const [seatsPerBoat, setSeatsPerBoat] = useState(6);
  const [loading, setLoading] = useState(false);

  const me = currentUser();

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert("Title is required");
      return;
    }
    if (!me) return;
    setLoading(true);
    try {
      const startAt = startDate.toISOString();
      const endAt = new Date(startDate.getTime() + 2 * 60 * 60 * 1000).toISOString();
      const maxParticipants = maxStr.trim() ? parseInt(maxStr, 10) : undefined;
      const boatAssignments: BoatAssignment[] = numBoats > 0
        ? Array.from({ length: numBoats }, (_, i) => ({
            boatName: `Boat ${i + 1}`,
            seats: Array.from({ length: seatsPerBoat }, (_, j) => ({
              seatNumber: j + 1,
              uid: null,
            })),
          }))
        : undefined as unknown as BoatAssignment[];

      await createEvent(clubId, me.uid, {
        title: title.trim(),
        type: eventType,
        description: description.trim() || undefined,
        startAt,
        endAt,
        location: locationName.trim() ? { name: locationName.trim() } : undefined,
        meetTime: meetTime.trim() || undefined,
        maxParticipants,
        boatAssignments: numBoats > 0 ? boatAssignments : undefined,
      });
      onDone();
    } catch {
      Alert.alert("Error", "Failed to create event.");
    } finally {
      setLoading(false);
    }
  };

  const EVENT_TYPES: EventType[] = ["practice", "race", "social"];

  const dateStr = startDate.toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
  const timeStr = startDate.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {/* Type */}
      <Text style={styles.sectionLabel}>EVENT TYPE</Text>
      <View style={styles.typeSelector}>
        {EVENT_TYPES.map((t) => (
          <Pill
            key={t}
            label={t.charAt(0).toUpperCase() + t.slice(1)}
            selected={eventType === t}
            gradient={t === "race" ? "coral" : t === "social" ? "aqua" : "ocean"}
            onPress={() => setEventType(t)}
          />
        ))}
      </View>

      {/* Title */}
      <Text style={styles.sectionLabel}>TITLE *</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Morning Practice"
        placeholderTextColor={colors.muted}
        value={title}
        onChangeText={setTitle}
      />

      {/* Date / Time */}
      <Text style={styles.sectionLabel}>DATE & TIME *</Text>
      <View style={styles.dateRow}>
        <Pressable style={[styles.input, styles.dateBtn, { flex: 1.4 }]} onPress={() => setShowDatePicker(true)}>
          <Ionicons name="calendar-outline" size={16} color={colors.muted} />
          <Text style={styles.dateBtnText}>{dateStr}</Text>
        </Pressable>
        <Pressable style={[styles.input, styles.dateBtn, { flex: 1 }]} onPress={() => setShowTimePicker(true)}>
          <Ionicons name="time-outline" size={16} color={colors.muted} />
          <Text style={styles.dateBtnText}>{timeStr}</Text>
        </Pressable>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          minimumDate={new Date()}
          onChange={(_, d) => {
            setShowDatePicker(Platform.OS === "ios");
            if (d) {
              const merged = new Date(startDate);
              merged.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
              setStartDate(merged);
            }
          }}
        />
      )}
      {showTimePicker && (
        <DateTimePicker
          value={startDate}
          mode="time"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, d) => {
            setShowTimePicker(Platform.OS === "ios");
            if (d) {
              const merged = new Date(startDate);
              merged.setHours(d.getHours(), d.getMinutes());
              setStartDate(merged);
            }
          }}
        />
      )}

      {/* Location */}
      <Text style={styles.sectionLabel}>LOCATION</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Keehi Lagoon"
        placeholderTextColor={colors.muted}
        value={locationName}
        onChangeText={setLocationName}
      />

      <Text style={styles.sectionLabel}>MEET TIME</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 6:45 AM"
        placeholderTextColor={colors.muted}
        value={meetTime}
        onChangeText={setMeetTime}
      />

      {/* Capacity */}
      <Text style={styles.sectionLabel}>MAX PARTICIPANTS (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="Leave blank for unlimited"
        placeholderTextColor={colors.muted}
        value={maxStr}
        onChangeText={setMaxStr}
        keyboardType="number-pad"
      />

      {/* Boat setup */}
      <Text style={styles.sectionLabel}>BOATS</Text>
      <View style={styles.stepperRow}>
        <Text style={styles.stepperLabel}>Number of boats</Text>
        <View style={styles.stepper}>
          <Pressable style={styles.stepBtn} onPress={() => setNumBoats(Math.max(0, numBoats - 1))}>
            <Text style={styles.stepBtnText}>−</Text>
          </Pressable>
          <Text style={styles.stepValue}>{numBoats}</Text>
          <Pressable style={styles.stepBtn} onPress={() => setNumBoats(Math.min(12, numBoats + 1))}>
            <Text style={styles.stepBtnText}>+</Text>
          </Pressable>
        </View>
      </View>
      {numBoats > 0 && (
        <View style={styles.stepperRow}>
          <Text style={styles.stepperLabel}>Seats per boat</Text>
          <View style={styles.stepper}>
            <Pressable style={styles.stepBtn} onPress={() => setSeatsPerBoat(Math.max(1, seatsPerBoat - 1))}>
              <Text style={styles.stepBtnText}>−</Text>
            </Pressable>
            <Text style={styles.stepValue}>{seatsPerBoat}</Text>
            <Pressable style={styles.stepBtn} onPress={() => setSeatsPerBoat(Math.min(12, seatsPerBoat + 1))}>
              <Text style={styles.stepBtnText}>+</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Description */}
      <Text style={styles.sectionLabel}>DESCRIPTION</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Details…"
        placeholderTextColor={colors.muted}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
      />

      <Button
        title={loading ? "Creating…" : "Create Event"}
        gradient="aqua"
        glow
        disabled={loading}
        onPress={handleCreate}
        style={{ marginTop: spacing.lg, marginBottom: spacing.xxl }}
      />
    </ScrollView>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatEventDate(startAt: string): string {
  const d = new Date(startAt);
  return (
    d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

function rsvpLabel(status: RsvpStatus): string {
  return { going: "✓ Going", maybe: "? Maybe", not_going: "✗ Can't" }[status];
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scrollContent: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 120 },
  sectionLabel: {
    fontSize: type.size.xs,
    fontWeight: type.weight.heavy,
    color: colors.muted,
    letterSpacing: type.spacing.label,
    textTransform: "uppercase",
    marginTop: spacing.md,
    marginLeft: spacing.xs,
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs },
  infoText: { fontSize: type.size.sm, color: colors.muted },
  description: { fontSize: type.size.md, color: colors.inkSoft, lineHeight: 22, marginTop: spacing.sm },

  // RSVP
  rsvpBtns: { flexDirection: "row", gap: spacing.sm },
  rsvpBtn: { flex: 1, borderWidth: 1.5, borderColor: colors.line, borderRadius: radii.md, paddingVertical: spacing.sm, alignItems: "center" },
  rsvpBtnDisabled: { opacity: 0.4 },
  rsvpBtnText: { fontWeight: type.weight.bold, color: colors.ink, fontSize: type.size.sm },

  // Attendance
  attendanceRow: { flexDirection: "row", gap: spacing.sm },
  statCard: { flex: 1, alignItems: "center", paddingVertical: spacing.sm },
  statCount: { fontSize: type.size.display, fontWeight: type.weight.heavy },
  statLabel: { fontSize: type.size.xs, color: colors.muted, marginTop: 2 },
  rosterWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  rosterChip: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: colors.bg, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  rosterAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.aqua, alignItems: "center", justifyContent: "center" },
  rosterInitial: { fontSize: 11, fontWeight: type.weight.heavy, color: colors.white },
  rosterName: { fontSize: type.size.sm, color: colors.ink, maxWidth: 80 },

  // Boats
  boatName: { fontSize: type.size.md, fontWeight: type.weight.heavy, color: colors.ink, marginBottom: spacing.sm },
  seatsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  seatChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.bg, borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: 6, minWidth: "30%" },
  seatChipMe: { backgroundColor: colors.aqua + "30", borderWidth: 1, borderColor: colors.aqua },
  seatNum: { fontSize: type.size.xs, fontWeight: type.weight.heavy, color: colors.muted, width: 16 },
  seatName: { fontSize: type.size.sm, color: colors.ink, flex: 1 },

  // Seat assignment modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: colors.white, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing.lg, maxHeight: "60%" },
  modalTitle: { fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.ink, marginBottom: spacing.md },
  assignRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  assignName: { fontSize: type.size.md, color: colors.ink },

  // Create form
  typeSelector: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xs },
  input: { backgroundColor: colors.white, borderRadius: radii.md, padding: spacing.md, fontSize: type.size.md, color: colors.ink },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  dateRow: { flexDirection: "row", gap: spacing.sm },
  dateBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dateBtnText: { fontSize: type.size.sm, color: colors.ink, flex: 1 },
  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.white, borderRadius: radii.md, padding: spacing.md },
  stepperLabel: { fontSize: type.size.md, color: colors.ink },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  stepBtnText: { fontSize: type.size.lg, fontWeight: type.weight.bold, color: colors.ink },
  stepValue: { fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.ink, minWidth: 24, textAlign: "center" },
});
