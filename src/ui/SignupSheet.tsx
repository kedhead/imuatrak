import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import {
  POTLUCK_TEMPLATE,
  SIGNUP_ITEMS_MAX,
  SIGNUP_LABEL_MAX,
  SIGNUP_NOTE_MAX,
  SIGNUP_SLOTS_MAX,
  claimCount,
  clampSlots,
  hasClaimed,
  openSlots,
  signupProgress,
  sortSignupItems,
  sortedClaims,
  type ClubMember,
  type SignupItem,
} from "@/models/club";
import { currentUser } from "@/services/auth";
import {
  SignupFullError,
  addSignupItems,
  addWriteInItem,
  claimSignupSlot,
  deleteSignupItem,
  releaseSignupSlot,
  subscribeSignupItems,
  updateSignupItem,
} from "@/services/clubService";
import { AnimatedPressable } from "./AnimatedPressable";
import { Button } from "./Button";
import { GradientCard } from "./GradientCard";
import { colors, radii, spacing, type } from "./theme";

const DETAILS_MAX = 120;

type Sheet =
  | { kind: "claim"; item: SignupItem }
  | { kind: "edit"; item: SignupItem | null }
  | { kind: "writeIn" };

/**
 * The sign-up sheet on an event: potluck dishes, snack duty, volunteer jobs.
 * Live via onSnapshot, so a claim shows up for everyone the moment it's made.
 * Staff build the list; anyone can take a slot or add a write-in. Hidden from
 * members entirely until staff add something.
 */
export function SignupSheet({
  clubId,
  eventId,
  isStaff,
  members,
  accent = colors.ocean,
}: {
  clubId: string;
  eventId: string;
  isStaff: boolean;
  members: ClubMember[];
  accent?: string;
}) {
  const me = currentUser();
  const [items, setItems] = useState<SignupItem[] | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState(false);

  // Form fields shared by the three sheets.
  const [label, setLabel] = useState("");
  const [details, setDetails] = useState("");
  const [note, setNote] = useState("");
  const [slots, setSlots] = useState(1);

  useEffect(() => {
    if (!clubId || !eventId) return;
    return subscribeSignupItems(clubId, eventId, setItems, () => setItems([]));
  }, [clubId, eventId]);

  const sorted = useMemo(() => sortSignupItems(items ?? []), [items]);
  const progress = signupProgress(sorted);
  const allCovered = progress.total > 0 && progress.filled >= progress.total;
  const myName =
    members.find((m) => m.uid === me?.uid)?.displayName ?? me?.displayName ?? "A member";
  const nameFor = (uid: string, fallback: string) =>
    members.find((m) => m.uid === uid)?.displayName ?? fallback;

  if (items === null) return null;
  if (items.length === 0 && !isStaff) return null;

  const open = (next: Sheet) => {
    if (next.kind === "claim") {
      setNote(me ? (next.item.claims[me.uid]?.note ?? "") : "");
    } else if (next.kind === "edit") {
      setLabel(next.item?.label ?? "");
      setDetails(next.item?.details ?? "");
      setSlots(next.item?.slots ?? 1);
    } else {
      setLabel("");
      setNote("");
    }
    setSheet(next);
  };
  const close = () => setSheet(null);

  /** Run a write, keep the sheet open on failure, and say what went wrong. */
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      close();
    } catch (e) {
      if (e instanceof SignupFullError) {
        Alert.alert("Snoozed and lost 😅", "Someone just grabbed the last slot on that one.");
        close();
      } else {
        Alert.alert("Couldn't save", e instanceof Error ? e.message : "Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const nextOrder = sorted.reduce((max, it) => Math.max(max, it.order), -1) + 1;
  const atItemCap = items.length >= SIGNUP_ITEMS_MAX;

  const addTemplate = () => {
    if (!me) return;
    void run(() => addSignupItems(clubId, eventId, me.uid, [...POTLUCK_TEMPLATE], nextOrder));
  };

  const saveItem = (item: SignupItem | null) => {
    const trimmed = label.trim();
    if (!trimmed || !me) return;
    const payload = { label: trimmed, slots: clampSlots(slots), details };
    void run(() =>
      item
        ? updateSignupItem(clubId, eventId, item.id, payload)
        : addSignupItems(clubId, eventId, me.uid, [payload], nextOrder),
    );
  };

  const removeItem = (item: SignupItem) => {
    const n = claimCount(item);
    Alert.alert(
      "Remove item?",
      n > 0
        ? `${n} ${n === 1 ? "person has" : "people have"} signed up for "${item.label}". They'll be taken off it.`
        : `Remove "${item.label}" from the sheet?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => void run(() => deleteSignupItem(clubId, eventId, item.id)),
        },
      ],
    );
  };

  const claim = (item: SignupItem) => {
    if (!me) return;
    void run(() => claimSignupSlot(clubId, eventId, item.id, me.uid, myName, note));
  };

  const drop = (item: SignupItem) => {
    if (!me) return;
    // A write-in only exists because you're bringing it; dropping out of it
    // removes the line rather than leaving an orphaned open slot.
    const isMyWriteIn = item.writeIn && item.createdBy === me.uid;
    void run(() =>
      isMyWriteIn
        ? deleteSignupItem(clubId, eventId, item.id)
        : releaseSignupSlot(clubId, eventId, item.id, me.uid),
    );
  };

  const addWriteIn = () => {
    const trimmed = label.trim();
    if (!trimmed || !me) return;
    void run(() => addWriteInItem(clubId, eventId, me.uid, myName, trimmed, note));
  };

  return (
    <>
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>SIGN-UP SHEET</Text>
        {progress.total > 0 && (
          <Text style={[styles.progressText, allCovered && { color: colors.success }]}>
            {progress.filled} / {progress.total} filled
          </Text>
        )}
      </View>

      <GradientCard>
        {sorted.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🥘</Text>
            <Text style={styles.emptyTitle}>Who&apos;s bringing what?</Text>
            <Text style={styles.emptyBody}>
              Add a sign-up sheet for a potluck, snack rotation or volunteer jobs. Members claim a
              slot and say what they&apos;ll bring.
            </Text>
            <View style={styles.emptyActions}>
              <Button title="🍍 Potluck template" gradient="sunrise" onPress={addTemplate} disabled={busy} />
              <Button title="Add an item" variant="outline" onPress={() => open({ kind: "edit", item: null })} />
            </View>
          </View>
        ) : (
          <>
            {progress.total > 0 && (
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.round((progress.filled / progress.total) * 100)}%`,
                      backgroundColor: allCovered ? colors.success : accent,
                    },
                  ]}
                />
              </View>
            )}
            {allCovered && (
              <Animated.Text entering={FadeIn} style={styles.covered}>
                🎉 Everything&apos;s covered — mahalo, everyone!
              </Animated.Text>
            )}

            {sorted.map((item, idx) => {
              const mine = hasClaimed(item, me?.uid);
              const left = openSlots(item);
              const claims = sortedClaims(item);
              return (
                <Animated.View
                  key={item.id}
                  entering={FadeInDown.delay(idx * 30).duration(300)}
                  style={[styles.item, idx > 0 && styles.itemDivider]}
                >
                  <View style={styles.itemHead}>
                    <View style={styles.flex}>
                      <Text style={styles.itemLabel}>
                        {item.label}
                        {item.writeIn ? <Text style={styles.writeInTag}>  write-in</Text> : null}
                      </Text>
                      {item.details ? <Text style={styles.itemDetails}>{item.details}</Text> : null}
                    </View>
                    <View style={[styles.countPill, left === 0 && styles.countPillFull]}>
                      <Text style={[styles.countText, left === 0 && { color: colors.success }]}>
                        {Math.min(claims.length, item.slots)}/{item.slots}
                      </Text>
                    </View>
                    {isStaff && !item.writeIn && (
                      <Pressable hitSlop={8} onPress={() => open({ kind: "edit", item })}>
                        <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
                      </Pressable>
                    )}
                    {isStaff && item.writeIn && (
                      <Pressable hitSlop={8} onPress={() => removeItem(item)}>
                        <Ionicons name="close" size={18} color={colors.muted} />
                      </Pressable>
                    )}
                  </View>

                  <View style={styles.claimWrap}>
                    {claims.map((c) => {
                      const isMe = c.uid === me?.uid;
                      return (
                        <Pressable
                          key={c.uid}
                          disabled={!isMe}
                          onPress={() => open({ kind: "claim", item })}
                          style={[styles.claimChip, isMe && { borderColor: accent, backgroundColor: accent + "18" }]}
                        >
                          <View style={[styles.avatar, { backgroundColor: isMe ? accent : colors.aqua }]}>
                            <Text style={styles.avatarText}>
                              {(nameFor(c.uid, c.name)[0] ?? "?").toUpperCase()}
                            </Text>
                          </View>
                          <Text style={styles.claimName} numberOfLines={1}>
                            {isMe ? "You" : nameFor(c.uid, c.name)}
                            {c.note ? <Text style={styles.claimNote}> · {c.note}</Text> : null}
                          </Text>
                          {isMe && <Ionicons name="create-outline" size={13} color={accent} />}
                        </Pressable>
                      );
                    })}
                    {!mine && left > 0 && (
                      <AnimatedPressable
                        haptic
                        style={[styles.signUpBtn, { borderColor: accent }]}
                        onPress={() => open({ kind: "claim", item })}
                      >
                        <Ionicons name="add" size={15} color={accent} />
                        <Text style={[styles.signUpText, { color: accent }]}>
                          Sign up{left > 1 ? ` · ${left} open` : ""}
                        </Text>
                      </AnimatedPressable>
                    )}
                    {!mine && left === 0 && <Text style={styles.fullText}>Full</Text>}
                  </View>
                </Animated.View>
              );
            })}

            <View style={styles.footer}>
              <Pressable
                style={styles.footerBtn}
                disabled={atItemCap}
                onPress={() => open({ kind: "writeIn" })}
              >
                <Ionicons name="sparkles-outline" size={15} color={colors.ocean} />
                <Text style={styles.footerText}>Bring something else</Text>
              </Pressable>
              {isStaff && (
                <Pressable
                  style={styles.footerBtn}
                  disabled={atItemCap}
                  onPress={() => open({ kind: "edit", item: null })}
                >
                  <Ionicons name="add-circle-outline" size={15} color={colors.ocean} />
                  <Text style={styles.footerText}>Add item</Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </GradientCard>

      <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={close}>
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <Pressable style={styles.overlay} onPress={close}>
            <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
              {sheet?.kind === "claim" && (() => {
                const item = items.find((i) => i.id === sheet.item.id) ?? sheet.item;
                const mine = hasClaimed(item, me?.uid);
                return (
                  <>
                    <Text style={styles.modalTitle}>{item.label}</Text>
                    {item.details ? <Text style={styles.modalHint}>{item.details}</Text> : null}
                    <TextInput
                      style={styles.input}
                      placeholder="What are you bringing? (optional)"
                      placeholderTextColor={colors.muted}
                      value={note}
                      onChangeText={setNote}
                      autoFocus
                      maxLength={SIGNUP_NOTE_MAX}
                      returnKeyType="done"
                      onSubmitEditing={() => claim(item)}
                    />
                    <Button
                      title={mine ? "Save" : "Count me in 🤙"}
                      gradient="aqua"
                      disabled={busy}
                      onPress={() => claim(item)}
                      style={styles.modalBtn}
                    />
                    {mine && (
                      <Button
                        title="Drop out"
                        variant="danger"
                        disabled={busy}
                        onPress={() => drop(item)}
                        style={styles.modalBtnSm}
                      />
                    )}
                  </>
                );
              })()}

              {sheet?.kind === "edit" && (
                <>
                  <Text style={styles.modalTitle}>{sheet.item ? "Edit item" : "Add an item"}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Dessert, Ice, Tent setup"
                    placeholderTextColor={colors.muted}
                    value={label}
                    onChangeText={setLabel}
                    autoFocus={!sheet.item}
                    maxLength={SIGNUP_LABEL_MAX}
                  />
                  <TextInput
                    style={[styles.input, styles.inputGap]}
                    placeholder="Details (optional) — e.g. Serves 10"
                    placeholderTextColor={colors.muted}
                    value={details}
                    onChangeText={setDetails}
                    maxLength={DETAILS_MAX}
                  />
                  {(() => {
                    // Can't shrink below the people already signed up.
                    const floor = Math.max(1, sheet.item ? claimCount(sheet.item) : 1);
                    return (
                      <View style={[styles.stepperRow, styles.inputGap]}>
                        <Text style={styles.stepperLabel}>People needed</Text>
                        <View style={styles.stepper}>
                          <Pressable
                            style={styles.stepBtn}
                            onPress={() => setSlots((s) => clampSlots(s - 1, floor))}
                          >
                            <Text style={styles.stepBtnText}>−</Text>
                          </Pressable>
                          <Text style={styles.stepValue}>{slots}</Text>
                          <Pressable
                            style={styles.stepBtn}
                            onPress={() => setSlots((s) => Math.min(SIGNUP_SLOTS_MAX, s + 1))}
                          >
                            <Text style={styles.stepBtnText}>+</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })()}
                  <Button
                    title={sheet.item ? "Save" : "Add to sheet"}
                    gradient="aqua"
                    disabled={busy || !label.trim()}
                    onPress={() => saveItem(sheet.item)}
                    style={styles.modalBtn}
                  />
                  {sheet.item && (
                    <Button
                      title="Remove item"
                      variant="danger"
                      disabled={busy}
                      onPress={() => removeItem(sheet.item!)}
                      style={styles.modalBtnSm}
                    />
                  )}
                </>
              )}

              {sheet?.kind === "writeIn" && (
                <>
                  <Text style={styles.modalTitle}>Bring something else</Text>
                  <Text style={styles.modalHint}>
                    Not on the list? Add it so nobody doubles up.
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="What is it? e.g. Poke, Musubi"
                    placeholderTextColor={colors.muted}
                    value={label}
                    onChangeText={setLabel}
                    autoFocus
                    maxLength={SIGNUP_LABEL_MAX}
                  />
                  <TextInput
                    style={[styles.input, styles.inputGap]}
                    placeholder="Any details? (optional)"
                    placeholderTextColor={colors.muted}
                    value={note}
                    onChangeText={setNote}
                    maxLength={SIGNUP_NOTE_MAX}
                  />
                  <Button
                    title="Add it 🤙"
                    gradient="aqua"
                    disabled={busy || !label.trim()}
                    onPress={addWriteIn}
                    style={styles.modalBtn}
                  />
                </>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: spacing.md,
    marginHorizontal: spacing.xs,
  },
  sectionLabel: {
    fontSize: type.size.xs,
    fontWeight: type.weight.heavy,
    color: colors.muted,
    letterSpacing: type.spacing.label,
  },
  progressText: { fontSize: type.size.xs, fontWeight: type.weight.bold, color: colors.muted, ...type.mono },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.bg, overflow: "hidden", marginBottom: spacing.sm },
  progressFill: { height: "100%", borderRadius: 3 },
  covered: { fontSize: type.size.sm, color: colors.success, fontWeight: type.weight.bold, marginBottom: spacing.xs },

  empty: { alignItems: "center", paddingVertical: spacing.sm },
  emptyEmoji: { fontSize: 36 },
  emptyTitle: { fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.ink, marginTop: spacing.xs },
  emptyBody: { fontSize: type.size.sm, color: colors.muted, textAlign: "center", lineHeight: 19, marginTop: spacing.xs },
  emptyActions: { alignSelf: "stretch", gap: spacing.sm, marginTop: spacing.md },

  item: { paddingVertical: spacing.sm },
  itemDivider: { borderTopWidth: 1, borderTopColor: colors.line },
  itemHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  itemLabel: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink },
  itemDetails: { fontSize: type.size.xs, color: colors.muted, marginTop: 2 },
  writeInTag: { fontSize: 11, fontWeight: type.weight.regular, fontStyle: "italic", color: colors.muted },
  countPill: { backgroundColor: colors.bg, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  countPillFull: { backgroundColor: colors.success + "22" },
  countText: { fontSize: type.size.xs, fontWeight: type.weight.heavy, color: colors.inkSoft, ...type.mono },

  claimWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  claimChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "100%",
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: radii.pill,
    paddingLeft: 3,
    paddingRight: spacing.sm,
    paddingVertical: 3,
  },
  avatar: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 10, fontWeight: type.weight.heavy, color: colors.white },
  claimName: { fontSize: type.size.sm, color: colors.ink, flexShrink: 1 },
  claimNote: { color: colors.muted },
  signUpBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  signUpText: { fontSize: type.size.sm, fontWeight: type.weight.bold },
  fullText: { fontSize: type.size.sm, color: colors.muted, fontStyle: "italic", paddingVertical: 4 },

  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
  },
  footerBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  footerText: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.ocean },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalTitle: { fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.ink, marginBottom: spacing.sm },
  modalHint: { fontSize: type.size.sm, color: colors.muted, lineHeight: 19, marginBottom: spacing.md },
  input: { backgroundColor: colors.bg, borderRadius: radii.md, padding: spacing.md, fontSize: type.size.md, color: colors.ink },
  inputGap: { marginTop: spacing.sm },
  modalBtn: { marginTop: spacing.md },
  modalBtnSm: { marginTop: spacing.sm, minHeight: 44 },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  stepperLabel: { fontSize: type.size.md, color: colors.ink },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  stepBtnText: { fontSize: type.size.lg, fontWeight: type.weight.bold, color: colors.ink },
  stepValue: { fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.ink, minWidth: 24, textAlign: "center", ...type.mono },
});
