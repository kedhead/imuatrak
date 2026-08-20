import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { deleteField } from "firebase/firestore";
import { currentUser } from "@/services/auth";
import {
  addEventGuest,
  getEvent,
  setRsvp,
  deleteEvent,
  createEvent,
  updateEvent,
  updateBoatAssignments,
} from "@/services/clubService";
import { useClub } from "@/services/clubStore";
import { syncEventReminders } from "@/services/eventReminders";
import {
  assignSeat,
  boatSeatCount,
  eventGoingCount,
  findSeatOf,
  inferBoatType,
  isGuestStillGoing,
  seatableGuests,
  BOAT_SPECS,
  BOAT_TYPES,
  type BoatAssignment,
  type BoatSpec,
  type BoatType,
  type ClubEvent,
  type ClubMember,
  type EventType,
  type RsvpStatus,
  type SeatAssignment,
  type SeatOccupant,
} from "@/models/club";
import { AnimatedPressable } from "@/ui/AnimatedPressable";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { GradientCard } from "@/ui/GradientCard";
import { GradientHeader } from "@/ui/GradientHeader";
import { Pill } from "@/ui/Pill";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, radii, spacing, type } from "@/ui/theme";

/** One-line summary of a boat's crew, shown under the picker. */
function describeBoat(t: BoatType): string {
  const spec = BOAT_SPECS[t];
  const paddlers = `${spec.paddlerSeats} paddler${spec.paddlerSeats === 1 ? "" : "s"}`;
  if (spec.crewSeats.length === 0) return `${paddlers}, single file`;
  const crew = spec.crewSeats.map((c) => c.label.toLowerCase()).join(" + ");
  return `${paddlers} in ${spec.paddlerSeats / 2} rows, plus ${crew} — ${boatSeatCount(t)} seats`;
}

/**
 * The spec behind a saved lineup, falling back to the seat count for lineups
 * written before boatType was stored.
 */
function specForBoat(boat: BoatAssignment): BoatSpec | null {
  const t = boat.boatType ?? inferBoatType(boat.seats.length);
  return t ? BOAT_SPECS[t] : null;
}

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
  const [editingEvent, setEditingEvent] = useState<ClubEvent | null>(null);

  const isNew = id === "new";
  const isAdmin = role === "owner" || role === "admin" || role === "coach";

  if (isNew && isAdmin) {
    return (
      <ScreenBackground>
        <GradientHeader title="New Event" />
        <EventForm clubId={club?.id ?? ""} mode="create" onDone={() => router.back()} />
      </ScreenBackground>
    );
  }

  if (editingEvent && isAdmin) {
    return (
      <ScreenBackground>
        <GradientHeader
          title="Edit Event"
          right={
            <Pressable onPress={() => setEditingEvent(null)} hitSlop={8}>
              <Text style={{ color: colors.white, fontSize: type.size.md, fontWeight: type.weight.bold }}>Cancel</Text>
            </Pressable>
          }
        />
        <EventForm
          clubId={club?.id ?? ""}
          mode="edit"
          initialEvent={editingEvent}
          onDone={() => setEditingEvent(null)}
        />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <EventDetail
        eventId={id}
        clubId={club?.id ?? ""}
        role={role}
        members={members}
        onEdit={isAdmin ? setEditingEvent : undefined}
      />
    </ScreenBackground>
  );
}

// ── Event detail ──────────────────────────────────────────────────────────────

function EventDetail({
  eventId,
  clubId,
  role,
  members,
  onEdit,
}: {
  eventId: string;
  clubId: string;
  role: string | null;
  members: ClubMember[];
  onEdit?: (event: ClubEvent) => void;
}) {
  const router = useRouter();
  const [event, setEvent] = useState<ClubEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ boatIdx: number; seatIdx: number } | null>(null);

  const [guestModal, setGuestModal] = useState(false);
  const [guestName, setGuestName] = useState("");

  const me = currentUser();
  const myEntry = event?.rsvps.find((r) => r.uid === me?.uid);
  const myRsvp = myEntry?.status ?? null;
  const myGuests = myEntry?.guests ?? [];
  const isAdmin = role === "owner" || role === "admin" || role === "coach";

  const goingUids = event?.rsvps.filter((r) => r.status === "going").map((r) => r.uid) ?? [];
  // Guests brought by going members, offered in the seat picker alongside them.
  const guestOptions = seatableGuests(event?.rsvps ?? []);
  // Headcount includes guests brought by going members.
  const goingCount = eventGoingCount(event?.rsvps ?? []);
  const maybeCount = event?.rsvps.filter((r) => r.status === "maybe").length ?? 0;
  const atCapacity =
    event?.maxParticipants != null && goingCount >= event.maxParticipants && myRsvp !== "going";

  useEffect(() => {
    if (!clubId || !eventId) return;
    getEvent(clubId, eventId)
      .then((ev) => {
        setEvent(ev);
        // Keep local reminders honest against admin time edits: re-sync
        // whenever a "going" paddler opens the event.
        const mine = ev?.rsvps.find((r) => r.uid === currentUser()?.uid);
        if (ev && mine) void syncEventReminders(ev, mine.status === "going");
      })
      .finally(() => setLoading(false));
  }, [clubId, eventId]);

  const handleRsvp = async (status: RsvpStatus) => {
    if (!clubId || !eventId || !me) return;
    setRsvpLoading(true);
    await setRsvp(clubId, eventId, me.uid, status);
    const updated = await getEvent(clubId, eventId);
    setEvent(updated);
    if (updated) void syncEventReminders(updated, status === "going");
    setRsvpLoading(false);
  };

  const handleAddGuest = async () => {
    const name = guestName.trim();
    if (!name || !clubId || !eventId || !me || !event) return;
    if (event.maxParticipants != null && goingCount >= event.maxParticipants) {
      Alert.alert("Event is full", "There's no room left for a guest on this one.");
      return;
    }
    setGuestModal(false);
    setGuestName("");
    setRsvpLoading(true);
    // Append server-side so adding a second guest can never overwrite the
    // first with a stale client list. Members can bring as many as capacity
    // allows.
    await addEventGuest(clubId, eventId, me.uid, name);
    setEvent(await getEvent(clubId, eventId));
    setRsvpLoading(false);
  };

  const handleRemoveGuest = async (index: number) => {
    if (!clubId || !eventId || !me || myRsvp === null) return;
    setRsvpLoading(true);
    const next = myGuests.filter((_, i) => i !== index);
    // Explicit empty array clears the stored guest list.
    await setRsvp(clubId, eventId, me.uid, myRsvp, next);
    setEvent(await getEvent(clubId, eventId));
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

  /** Seat a member, seat a guest, or clear the seat. See assignSeat: someone
   *  already seated is moved, not duplicated. */
  const handleAssignSeat = async (occupant: SeatOccupant | null) => {
    if (!event || assignTarget === null) return;
    const boats = assignSeat(
      event.boatAssignments ?? [],
      assignTarget.boatIdx,
      assignTarget.seatIdx,
      occupant,
    );
    setAssignTarget(null);
    await updateBoatAssignments(clubId, eventId, boats);
    const updated = await getEvent(clubId, eventId);
    setEvent(updated);
  };

  const handleAddBoat = async () => {
    if (!event) return;
    const boats: BoatAssignment[] = [...(event.boatAssignments ?? [])];
    // Match the boat the event is already using — an added boat should be the
    // same hull, not a differently sized one. OC6 when there's nothing to copy.
    const first = boats[0];
    const boatType: BoatType =
      first?.boatType ?? (first ? inferBoatType(first.seats.length) : null) ?? "OC6";
    const seatCount = first?.seats.length ?? boatSeatCount(boatType);
    boats.push({
      boatName: `Boat ${boats.length + 1}`,
      boatType,
      seats: Array.from({ length: seatCount }, (_, i) => ({ seatNumber: i + 1, uid: null })),
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

  /**
   * Where someone is already sitting, for the picker rows. Assigning them
   * elsewhere moves them out of this seat rather than duplicating them, so
   * saying so up front keeps that from looking like a bug.
   */
  const seatedLabel = (occupant: SeatOccupant): string | null => {
    const at = findSeatOf(boats, occupant);
    if (!at) return null;
    const boat = boats[at.boatIdx]!;
    const spec = specForBoat(boat);
    const crew = spec?.crewSeats[at.seatIdx - spec.paddlerSeats];
    const where = crew ? crew.label.toLowerCase() : `seat ${at.seatIdx + 1}`;
    return boats.length > 1 ? `in ${boat.boatName}, ${where}` : `in ${where}`;
  };

  return (
    <>
      <GradientHeader
        title={event.title}
        subtitle={formatEventDate(event.startAt)}
        right={
          isAdmin ? (
            <View style={styles.headerActions}>
              {onEdit && (
                <Pressable onPress={() => onEdit(event)} hitSlop={8}>
                  <Ionicons name="pencil-outline" size={20} color={colors.white} />
                </Pressable>
              )}
              <Pressable onPress={handleDelete} hitSlop={8}>
                <Ionicons name="trash-outline" size={22} color={colors.white} />
              </Pressable>
            </View>
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
            {myRsvp === "going" && (
              <View style={styles.guestSection}>
                {myGuests.map((g, i) => (
                  <Pressable
                    key={`${g}-${i}`}
                    style={styles.guestChip}
                    disabled={rsvpLoading}
                    onPress={() =>
                      Alert.alert("Remove guest?", `Remove ${g} from this event?`, [
                        { text: "Cancel", style: "cancel" },
                        { text: "Remove", style: "destructive", onPress: () => void handleRemoveGuest(i) },
                      ])
                    }
                  >
                    <Ionicons name="person-add-outline" size={13} color={colors.ocean} />
                    <Text style={styles.guestChipText}>{g}</Text>
                    <Ionicons name="close" size={13} color={colors.muted} />
                  </Pressable>
                ))}
                <Pressable
                  style={styles.addGuestBtn}
                  disabled={rsvpLoading}
                  onPress={() => setGuestModal(true)}
                >
                  <Ionicons name="add" size={15} color={colors.ocean} />
                  <Text style={styles.addGuestText}>
                    {myGuests.length > 0 ? "Bring another guest" : "Bring a guest"}
                  </Text>
                </Pressable>
              </View>
            )}
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
            {goingCount > 0 && (
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
                {(event.rsvps ?? [])
                  .filter((r) => r.status === "going" && r.guests?.length)
                  .flatMap((r) =>
                    (r.guests ?? []).map((g, i) => (
                      <View key={`${r.uid}-guest-${i}`} style={[styles.rosterChip, styles.guestRosterChip]}>
                        <View style={[styles.rosterAvatar, { backgroundColor: colors.gold }]}>
                          <Text style={styles.rosterInitial}>{(g[0] ?? "?").toUpperCase()}</Text>
                        </View>
                        <Text style={styles.rosterName} numberOfLines={1}>{g}</Text>
                        <Text style={styles.guestTag}>guest</Text>
                      </View>
                    )),
                  )}
              </View>
            )}
          </GradientCard>
        </Animated.View>

        {/* Boat lineup */}
        {(boats.length > 0 || isAdmin) && (
          <Animated.View entering={FadeInDown.delay(180).duration(400)}>
            <Text style={styles.sectionLabel}>LINEUP</Text>
            {boats.map((boat, bi) => {
              const renderSeat = (
                seat: SeatAssignment,
                si: number,
                extra?: ViewStyle,
                /** Crew seats show their role instead of a paddler number. */
                label?: string,
              ) => {
                const assignedMember = seat.uid ? memberByUid(seat.uid) : null;
                const guest = seat.uid ? null : (seat.guest ?? null);
                // A seated guest whose host withdrew them, or stopped going.
                // Nothing clears these automatically (see isGuestStillGoing),
                // so they are shown muted for staff to notice and reassign.
                const staleGuest = guest != null && !isGuestStillGoing(guest, event?.rsvps ?? []);
                const occupantName = assignedMember?.displayName ?? guest?.name ?? null;
                const isMe = seat.uid === me?.uid;
                return (
                  <AnimatedPressable
                    key={si}
                    style={[
                      styles.seatChip,
                      isMe && styles.seatChipMe,
                      guest != null && styles.seatChipGuest,
                      extra,
                    ]}
                    onPress={isAdmin ? () => setAssignTarget({ boatIdx: bi, seatIdx: si }) : undefined}
                  >
                    <Text style={[styles.seatNum, label && styles.crewLabel]}>
                      {label ?? seat.seatNumber}
                    </Text>
                    <Text
                      style={[styles.seatName, (!occupantName || staleGuest) && { color: colors.muted }]}
                      numberOfLines={1}
                    >
                      {occupantName ?? "Empty"}
                    </Text>
                  </AnimatedPressable>
                );
              };

              const spec = specForBoat(boat);
              // Guard against a lineup shorter than its spec (an older event
              // saved before the drummer and steer seats existed).
              const paddlerCount = Math.min(spec?.paddlerSeats ?? boat.seats.length, boat.seats.length);
              const crew = (spec?.crewSeats ?? [])
                .map((c, ci) => ({ ...c, index: paddlerCount + ci }))
                .filter((c) => c.index < boat.seats.length);

              const renderCrew = (position: "bow" | "stern") =>
                crew
                  .filter((c) => c.position === position)
                  .map((c) => (
                    <View key={c.label} style={styles.crewRow}>
                      {renderSeat(boat.seats[c.index]!, c.index, styles.seatChipFull, c.label)}
                    </View>
                  ));

              return (
                <GradientCard key={bi} style={{ marginBottom: spacing.sm }}>
                  <Text style={styles.boatName}>{boat.boatName}</Text>
                  {spec?.paired ? (
                    <View>
                      {renderCrew("bow")}
                      <View style={styles.pairHeaderRow}>
                        <Text style={styles.pairSideLabel}>LEFT</Text>
                        <Text style={styles.pairSideLabel}>RIGHT</Text>
                      </View>
                      {Array.from({ length: Math.ceil(paddlerCount / 2) }, (_, r) => {
                        const left = boat.seats[r * 2];
                        const right = boat.seats[r * 2 + 1];
                        return (
                          <View key={r} style={styles.pairRow}>
                            <View style={styles.pairSide}>
                              {left ? renderSeat(left, r * 2, styles.seatChipFull) : null}
                            </View>
                            <View style={styles.pairSide}>
                              {right ? renderSeat(right, r * 2 + 1, styles.seatChipFull) : null}
                            </View>
                          </View>
                        );
                      })}
                      {renderCrew("stern")}
                    </View>
                  ) : (
                    <View style={styles.seatsGrid}>
                      {boat.seats.map((seat, si) => renderSeat(seat, si))}
                    </View>
                  )}
                </GradientCard>
              );
            })}
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
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Assign seat</Text>
            <ScrollView style={styles.assignScroll}>
              <Pressable style={styles.assignRow} onPress={() => handleAssignSeat(null)}>
                <Ionicons name="close-circle-outline" size={20} color={colors.muted} />
                <Text style={[styles.assignName, { color: colors.muted }]}>Clear seat</Text>
              </Pressable>
              {goingUids.map((uid) => {
                const m = memberByUid(uid);
                return (
                  <Pressable key={uid} style={styles.assignRow} onPress={() => handleAssignSeat({ uid })}>
                    <View style={[styles.rosterAvatar, { backgroundColor: colors.ocean }]}>
                      <Text style={styles.rosterInitial}>{(m?.displayName?.[0] ?? "?").toUpperCase()}</Text>
                    </View>
                    <Text style={styles.assignName}>{m?.displayName ?? uid.slice(0, 8)}</Text>
                    <Text style={styles.assignSeatedTag}>{seatedLabel({ uid })}</Text>
                  </Pressable>
                );
              })}
              {/* Guests are paddlers too — they were missing from this list
                  entirely, which left no way to put one in a boat. Keyed by
                  host + index because two members may bring a same-named
                  guest, and one member may bring two. */}
              {guestOptions.map((g, i) => (
                <Pressable
                  key={`${g.hostUid}-${i}`}
                  style={styles.assignRow}
                  onPress={() => handleAssignSeat({ guest: g })}
                >
                  <View style={[styles.rosterAvatar, { backgroundColor: colors.gold }]}>
                    <Text style={styles.rosterInitial}>{(g.name[0] ?? "?").toUpperCase()}</Text>
                  </View>
                  <Text style={styles.assignName}>{g.name}</Text>
                  <Text style={styles.assignSeatedTag}>
                    {seatedLabel({ guest: g }) ??
                      `guest of ${memberByUid(g.hostUid)?.displayName ?? "a member"}`}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Guest name modal (Alert.prompt is iOS-only, so a tiny sheet instead) */}
      <Modal
        visible={guestModal}
        transparent
        animationType="slide"
        onRequestClose={() => setGuestModal(false)}
      >
        {/* The sheet is bottom-anchored and the input autofocuses, so without
            this the keyboard covers the whole sheet — you can't see what
            you're typing. Padding behavior lifts the sheet above the keyboard. */}
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setGuestModal(false)}>
            <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>Bring a guest</Text>
              <Text style={styles.guestModalHint}>
                Registering a guest paddler counts them toward attendance so the coach can plan
                boats. They don&apos;t need the app or an account.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Guest's name"
                placeholderTextColor={colors.muted}
                value={guestName}
                onChangeText={setGuestName}
                autoFocus
                autoCapitalize="words"
                maxLength={40}
                returnKeyType="done"
                onSubmitEditing={() => void handleAddGuest()}
              />
              <Button
                title="Add guest"
                gradient="aqua"
                disabled={!guestName.trim()}
                onPress={() => void handleAddGuest()}
                style={{ marginTop: spacing.md }}
              />
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ── Event form (create + edit) ────────────────────────────────────────────────

function EventForm({
  clubId,
  mode,
  initialEvent,
  onDone,
}: {
  clubId: string;
  mode: "create" | "edit";
  initialEvent?: ClubEvent;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(initialEvent?.title ?? "");
  const [eventType, setEventType] = useState<EventType>(initialEvent?.type ?? "practice");
  const [description, setDescription] = useState(initialEvent?.description ?? "");
  const [startDate, setStartDate] = useState(
    initialEvent ? new Date(initialEvent.startAt) : new Date(),
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [locationName, setLocationName] = useState(initialEvent?.location?.name ?? "");
  const [meetTime, setMeetTime] = useState(initialEvent?.meetTime ?? "");
  const [maxStr, setMaxStr] = useState(
    initialEvent?.maxParticipants != null ? String(initialEvent.maxParticipants) : "",
  );
  const [numBoats, setNumBoats] = useState(initialEvent?.boatAssignments?.length ?? 0);
  const [boatType, setBoatType] = useState<BoatType>(() => {
    const first = initialEvent?.boatAssignments?.[0];
    // Lineups saved before boat types existed only carry a seat count.
    return first?.boatType ?? (first ? inferBoatType(first.seats.length) : null) ?? "OC6";
  });
  const [loading, setLoading] = useState(false);

  const me = currentUser();

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert("Title is required");
      return;
    }
    if (!me) return;
    setLoading(true);
    try {
      const startAt = startDate.toISOString();
      const endAt = new Date(startDate.getTime() + 2 * 60 * 60 * 1000).toISOString();
      const seatsPerBoat = boatSeatCount(boatType);
      const boatAssignments: BoatAssignment[] = Array.from({ length: numBoats }, (_, i) => ({
        boatName: initialEvent?.boatAssignments?.[i]?.boatName ?? `Boat ${i + 1}`,
        boatType,
        seats: Array.from({ length: seatsPerBoat }, (_, j) => ({
          seatNumber: j + 1,
          // Switching boat type keeps whoever already sat in a seat that still
          // exists; seats the new boat doesn't have are dropped.
          uid: initialEvent?.boatAssignments?.[i]?.seats[j]?.uid ?? null,
        })),
      }));

      if (mode === "edit" && initialEvent) {
        // updateDoc rejects undefined — use deleteField() to clear optional fields
        await updateEvent(clubId, initialEvent.id, {
          title: title.trim(),
          type: eventType,
          startAt,
          endAt,
          description: description.trim() || (deleteField() as unknown as string),
          location: locationName.trim() ? { name: locationName.trim() } : (deleteField() as unknown as { name: string }),
          meetTime: meetTime.trim() || (deleteField() as unknown as string),
          maxParticipants: maxStr.trim() ? parseInt(maxStr, 10) : (deleteField() as unknown as number),
          boatAssignments: numBoats > 0 ? boatAssignments : (deleteField() as unknown as BoatAssignment[]),
        });
      } else {
        await createEvent(clubId, me.uid, {
          title: title.trim(),
          type: eventType,
          description: description.trim() || undefined,
          startAt,
          endAt,
          location: locationName.trim() ? { name: locationName.trim() } : undefined,
          meetTime: meetTime.trim() || undefined,
          maxParticipants: maxStr.trim() ? parseInt(maxStr, 10) : undefined,
          boatAssignments: numBoats > 0 ? boatAssignments : undefined,
        });
      }
      onDone();
    } catch {
      Alert.alert("Error", `Failed to ${mode === "edit" ? "update" : "create"} event.`);
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
          // The app's screens are hardcoded light, but the native picker
          // follows the SYSTEM appearance — on a phone in dark mode it drew
          // white numbers on our light background, leaving the calendar
          // unreadable. Pin it to light so it matches the surrounding UI.
          themeVariant="light"
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
          themeVariant="light"
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
        <>
          <Text style={styles.stepperLabel}>Boat</Text>
          <View style={styles.boatSelector}>
            {BOAT_TYPES.map((t) => (
              <Pill
                key={t}
                label={t}
                selected={boatType === t}
                gradient={BOAT_SPECS[t].paired ? "coral" : "ocean"}
                onPress={() => setBoatType(t)}
              />
            ))}
          </View>
          <Text style={styles.boatHint}>{describeBoat(boatType)}</Text>
        </>
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
        title={loading ? (mode === "edit" ? "Saving…" : "Creating…") : (mode === "edit" ? "Save Changes" : "Create Event")}
        gradient="aqua"
        glow
        disabled={loading}
        onPress={handleSubmit}
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
  flex: { flex: 1 },
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

  // Header
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.md },

  // RSVP
  rsvpBtns: { flexDirection: "row", gap: spacing.sm },
  rsvpBtn: { flex: 1, borderWidth: 1.5, borderColor: colors.line, borderRadius: radii.md, paddingVertical: spacing.sm, alignItems: "center" },
  rsvpBtnDisabled: { opacity: 0.4 },
  rsvpBtnText: { fontWeight: type.weight.bold, color: colors.ink, fontSize: type.size.sm },

  // Guests
  guestSection: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  guestChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.bg, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  guestChipText: { fontSize: type.size.sm, color: colors.ink },
  addGuestBtn: { flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1.5, borderColor: colors.ocean + "55", borderStyle: "dashed", borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  addGuestText: { fontSize: type.size.sm, color: colors.ocean, fontWeight: type.weight.bold },
  guestRosterChip: { backgroundColor: colors.gold + "18" },
  guestTag: { fontSize: 10, color: colors.muted, fontStyle: "italic" },
  guestModalHint: { fontSize: type.size.sm, color: colors.muted, lineHeight: 19, marginBottom: spacing.md },

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
  pairHeaderRow: { flexDirection: "row", gap: spacing.xs, marginBottom: 4 },
  pairSideLabel: {
    flex: 1,
    fontSize: type.size.xs,
    fontWeight: type.weight.heavy,
    color: colors.muted,
    letterSpacing: type.spacing.label,
  },
  pairRow: { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.xs },
  pairSide: { flex: 1 },
  crewRow: { marginBottom: spacing.xs },
  crewLabel: { width: "auto", color: colors.ocean },
  boatHint: { fontSize: type.size.xs, color: colors.muted, marginTop: 2, marginBottom: spacing.sm },
  // Overrides seatChip's 30% floor, which exists for the wrapping grid and
  // would fight the two fixed columns here.
  seatChipFull: { minWidth: 0, width: "100%" },
  seatChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.bg, borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: 6, minWidth: "30%" },
  seatChipMe: { backgroundColor: colors.aqua + "30", borderWidth: 1, borderColor: colors.aqua },
  // Same gold tint the roster uses for guests, so a lineup reads at a glance.
  seatChipGuest: { backgroundColor: colors.gold + "18" },
  assignSeatedTag: { fontSize: 11, color: colors.muted, fontStyle: "italic" },
  seatNum: { fontSize: type.size.xs, fontWeight: type.weight.heavy, color: colors.muted, width: 16 },
  seatName: { fontSize: type.size.sm, color: colors.ink, flex: 1 },

  // Seat assignment modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: colors.white, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing.lg, maxHeight: "80%" },
  // flexShrink lets the ScrollView bound itself to the sheet's height instead
  // of expanding to its full content height (which left the list unscrollable
  // and clipped the people at the bottom).
  assignScroll: { flexShrink: 1 },
  modalTitle: { fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.ink, marginBottom: spacing.md },
  assignRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  assignName: { fontSize: type.size.md, color: colors.ink },

  // Event form
  typeSelector: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xs },
  // Six boats don't fit on one line the way three event types do, so this
  // wraps rather than running the last option off the edge of the screen.
  boatSelector: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.xs },
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
