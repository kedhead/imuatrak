import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { clubIsPro } from "@/models/club";
import {
  addDays,
  canSeeWorkoutDetails,
  formatMinutes,
  leaderboard,
  localDate,
  WORKOUT_KINDS,
  WORKOUT_MINUTE_PRESETS,
  WORKOUT_MINUTES_MAX,
  WORKOUT_NOTE_MAX,
  weekLabel,
  weekStart,
  weekStreak,
  weekTotals,
  workoutKindInfo,
  type Workout,
  type WorkoutKind,
  type WorkoutWeek,
} from "@/models/workouts";
import { currentUser } from "@/services/auth";
import { useClub } from "@/services/clubStore";
import {
  addWorkout,
  deleteWorkout,
  importMyPaddles,
  subscribeClubWorkouts,
  subscribeMyWorkouts,
  subscribeWorkoutWeek,
} from "@/services/workoutService";
import { AnimatedPressable } from "@/ui/AnimatedPressable";
import { Button } from "@/ui/Button";
import { Gradient } from "@/ui/Gradient";
import { GradientCard } from "@/ui/GradientCard";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, radii, spacing, type } from "@/ui/theme";

const MEDALS = ["🥇", "🥈", "🥉"];

/**
 * Club Training log: log off-the-water workouts, recorded paddles count
 * automatically, and a weekly leaderboard keeps it fun. Everyone sees the
 * leaderboard; coaches and admins also see the team's entries.
 */
export default function TrainingScreen() {
  const router = useRouter();
  const club = useClub((s) => s.club);
  const role = useClub((s) => s.role);
  const members = useClub((s) => s.members);
  const user = currentUser();
  const uid = user?.uid ?? "";
  const myName = members.find((m) => m.uid === uid)?.displayName || user?.displayName || "Member";
  const clubId = club?.id;
  const pro = clubIsPro(club);
  const isStaff = canSeeWorkoutDetails(role);

  const today = localDate();
  const thisWeek = weekStart(today);
  const lastWeek = addDays(thisWeek, -7);
  const [shownWeek, setShownWeek] = useState(thisWeek);

  const [weekDoc, setWeekDoc] = useState<WorkoutWeek | null>(null);
  const [thisWeekDoc, setThisWeekDoc] = useState<WorkoutWeek | null>(null);
  const [mine, setMine] = useState<Workout[] | null>(null);
  const [team, setTeam] = useState<Workout[]>([]);
  const [logging, setLogging] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!clubId || !pro) return;
    return subscribeWorkoutWeek(clubId, shownWeek, setWeekDoc);
  }, [clubId, pro, shownWeek]);
  useEffect(() => {
    if (!clubId || !pro) return;
    return subscribeWorkoutWeek(clubId, thisWeek, setThisWeekDoc);
  }, [clubId, pro, thisWeek]);
  useEffect(() => {
    if (!clubId || !pro || !uid) return;
    return subscribeMyWorkouts(clubId, uid, setMine);
  }, [clubId, pro, uid]);
  useEffect(() => {
    if (!clubId || !pro || !isStaff) return;
    return subscribeClubWorkouts(clubId, lastWeek, setTeam);
  }, [clubId, pro, isStaff, lastWeek]);

  // People already using the log get their recorded paddles counted
  // automatically (this week and last). Others get a button, so nobody lands
  // on the leaderboard without choosing to.
  const autoImported = useRef(false);
  const participating = (mine?.length ?? 0) > 0;
  const runImport = async (quiet: boolean) => {
    if (!clubId || !uid || !mine) return;
    setImporting(true);
    try {
      const n = await importMyPaddles(clubId, uid, myName, lastWeek, new Set(mine.map((w) => w.id)));
      if (!quiet) {
        Alert.alert(
          n ? "Paddles added 🛶" : "All caught up",
          n ? `${n} recorded paddle${n === 1 ? "" : "s"} from the last two weeks now count.` : "No new recorded paddles from the last two weeks.",
        );
      }
    } catch {
      if (!quiet) Alert.alert("Couldn't add paddles", "Please try again.");
    } finally {
      setImporting(false);
    }
  };
  useEffect(() => {
    if (autoImported.current || !mine || !participating) return;
    autoImported.current = true;
    void runImport(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, participating]);

  const nameFor = useMemo(() => {
    const m = new Map(members.map((x) => [x.uid, x.displayName]));
    return (u: string) => m.get(u);
  }, [members]);
  const rows = useMemo(() => leaderboard(weekDoc, nameFor), [weekDoc, nameFor]);
  const teamNow = weekTotals(thisWeekDoc);
  const myThisWeek = (mine ?? []).filter((w) => weekStart(w.date) === thisWeek);
  const myMinutes = myThisWeek.reduce((n, w) => n + w.minutes, 0);
  const streak = weekStreak((mine ?? []).map((w) => w.date), today);
  const myRecent = [...(mine ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 12);

  if (!club) return null;
  if (!pro) {
    return (
      <SafeAreaView style={styles.lockWrap} edges={["bottom"]}>
        <Text style={styles.lockEmoji}>💪</Text>
        <Text style={styles.lockTitle}>Training log is an ImuaTrak+ feature</Text>
        <Text style={styles.lockText}>
          Members log their off-the-water workouts, recorded paddles count automatically, and a
          weekly leaderboard keeps the crew motivated. Coaches see what everyone's doing.
        </Text>
        {role === "owner" || role === "admin" ? (
          <Button title="Upgrade club" gradient="sunrise" glow onPress={() => router.push("/paywall")} style={styles.lockBtn} />
        ) : (
          <Text style={styles.lockHint}>Ask a club owner or admin to upgrade.</Text>
        )}
      </SafeAreaView>
    );
  }

  const onWorkoutPress = (w: Workout, canDelete: boolean) => {
    const info = workoutKindInfo(w.kind);
    const lines = [`${formatMinutes(w.minutes)} · ${new Date(`${w.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`];
    if (w.note) lines.push(`“${w.note}”`);
    Alert.alert(`${info.emoji} ${w.uid === uid ? info.label : `${w.name} · ${info.label}`}`, lines.join("\n"), [
      { text: "Close", style: "cancel" },
      ...(canDelete
        ? [{
            text: "Delete",
            style: "destructive" as const,
            onPress: () => void deleteWorkout(club.id, w.id).catch(() => Alert.alert("Couldn't delete", "Please try again.")),
          }]
        : []),
    ]);
  };

  // Team log for the shown week, grouped by person (coaches/admins).
  const teamWeek = team.filter((w) => weekStart(w.date) === shownWeek);
  const teamByPerson = new Map<string, Workout[]>();
  for (const w of teamWeek) teamByPerson.set(w.uid, [...(teamByPerson.get(w.uid) ?? []), w]);
  const teamPeople = [...teamByPerson.entries()].sort(
    (a, b) => b[1].length - a[1].length || (nameFor(a[0]) ?? a[1][0]!.name).localeCompare(nameFor(b[0]) ?? b[1][0]!.name),
  );

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Gradient name="ocean" style={styles.hero}>
          <Text style={styles.heroLabel}>THIS WEEK · {weekLabel(thisWeek).toUpperCase()}</Text>
          <Text style={styles.heroBig}>
            {teamNow.count} workout{teamNow.count === 1 ? "" : "s"} 🔥
          </Text>
          <Text style={styles.heroMeta}>
            {teamNow.people} paddler{teamNow.people === 1 ? "" : "s"} · {formatMinutes(teamNow.minutes)} as a team
          </Text>
          <View style={styles.heroYou}>
            <Text style={styles.heroYouText}>
              You: {myThisWeek.length} · {formatMinutes(myMinutes)}
            </Text>
            {streak > 1 && <Text style={styles.heroYouText}>🔥 {streak}-week streak</Text>}
          </View>
        </Gradient>

        <Button title="＋ Log a workout" gradient="sunrise" glow onPress={() => setLogging(true)} />
        {!participating && mine !== null && (
          <Pressable style={styles.importBtn} onPress={() => void runImport(false)} disabled={importing}>
            {importing ? <ActivityIndicator size="small" color={colors.ocean} /> : <Text style={styles.importEmoji}>🛶</Text>}
            <Text style={styles.importText}>Count my recorded paddles</Text>
          </Pressable>
        )}

        <View style={styles.weekToggle}>
          {[
            [thisWeek, "This week"],
            [lastWeek, "Last week"],
          ].map(([w, label]) => (
            <Pressable key={w} onPress={() => setShownWeek(w!)} style={[styles.weekBtn, shownWeek === w && styles.weekBtnOn]}>
              <Text style={[styles.weekBtnText, shownWeek === w && styles.weekBtnTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.section}>LEADERBOARD · {weekLabel(shownWeek).toUpperCase()}</Text>
        <GradientCard padded={false}>
          {rows.length === 0 ? (
            <Text style={styles.empty}>
              {shownWeek === thisWeek ? "No workouts yet this week. Be the first! 💪" : "Nobody logged anything that week."}
            </Text>
          ) : (
            rows.map((r) => (
              <View key={r.uid} style={[styles.row, r.uid === uid && styles.rowMe]}>
                <Text style={styles.rank}>{r.rank <= 3 ? MEDALS[r.rank - 1] : r.rank}</Text>
                <Text style={[styles.name, r.uid === uid && styles.nameMe]} numberOfLines={1}>
                  {r.name}{r.uid === uid ? " (you)" : ""}
                </Text>
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{r.count}</Text>
                  <Text style={styles.statLabel}>{formatMinutes(r.minutes)}</Text>
                </View>
              </View>
            ))
          )}
        </GradientCard>
        <Text style={styles.hint}>Ranked by workouts, then time. Everyone in the club sees this board.</Text>

        {myRecent.length > 0 && (
          <>
            <Text style={styles.section}>MY WORKOUTS</Text>
            <GradientCard padded={false}>
              {myRecent.map((w) => {
                const info = workoutKindInfo(w.kind);
                return (
                  <AnimatedPressable key={w.id} style={styles.row} onPress={() => onWorkoutPress(w, true)}>
                    <Text style={styles.kindEmoji}>{info.emoji}</Text>
                    <View style={styles.flex}>
                      <Text style={styles.name} numberOfLines={1}>{info.label}{w.sessionId ? " · recorded" : ""}</Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {new Date(`${w.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                        {w.note ? ` · ${w.note}` : ""}
                      </Text>
                    </View>
                    <Text style={styles.minutes}>{formatMinutes(w.minutes)}</Text>
                  </AnimatedPressable>
                );
              })}
            </GradientCard>
          </>
        )}

        {isStaff && (
          <>
            <Text style={styles.section}>TEAM LOG · {weekLabel(shownWeek).toUpperCase()}</Text>
            <GradientCard padded={false}>
              {teamPeople.length === 0 ? (
                <Text style={styles.empty}>Nothing logged yet.</Text>
              ) : (
                teamPeople.map(([personUid, list]) => (
                  <View key={personUid} style={styles.teamPerson}>
                    <Text style={styles.teamName}>
                      {nameFor(personUid) ?? list[0]!.name}{" "}
                      <Text style={styles.meta}>· {list.length} · {formatMinutes(list.reduce((n, w) => n + w.minutes, 0))}</Text>
                    </Text>
                    {[...list].sort((a, b) => a.date.localeCompare(b.date)).map((w) => (
                      <Pressable key={w.id} onPress={() => onWorkoutPress(w, true)} style={styles.teamEntry}>
                        <Text style={styles.teamEntryText} numberOfLines={2}>
                          {workoutKindInfo(w.kind).emoji} {new Date(`${w.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })} · {formatMinutes(w.minutes)}
                          {w.note ? ` · ${w.note}` : ""}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ))
              )}
            </GradientCard>
            <Text style={styles.hint}>Only coaches and admins see the team log.</Text>
          </>
        )}
      </ScrollView>

      <LogWorkoutSheet
        visible={logging}
        today={today}
        onClose={() => setLogging(false)}
        onSave={async (w) => {
          await addWorkout(club.id, { uid, name: myName, ...w });
        }}
      />
    </ScreenBackground>
  );
}

/** Quick log: what, how long, which day, optional note. */
function LogWorkoutSheet({
  visible,
  today,
  onClose,
  onSave,
}: {
  visible: boolean;
  today: string;
  onClose: () => void;
  onSave: (w: { kind: WorkoutKind; minutes: number; date: string; note?: string }) => Promise<void>;
}) {
  const [kind, setKind] = useState<WorkoutKind>("gym");
  const [minutes, setMinutes] = useState(45);
  const [custom, setCustom] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  const dayLabel = (d: string, i: number) =>
    i === 0 ? "Today" : i === 1 ? "Yesterday" : new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });

  const reset = () => {
    setKind("gym");
    setMinutes(45);
    setCustom("");
    setDate(today);
    setNote("");
  };

  const save = async () => {
    const m = custom ? parseInt(custom, 10) : minutes;
    if (!Number.isFinite(m) || m < 1 || m > WORKOUT_MINUTES_MAX) {
      return Alert.alert("How long?", `Enter between 1 and ${WORKOUT_MINUTES_MAX} minutes.`);
    }
    setSaving(true);
    try {
      await onSave({ kind, minutes: m, date, note });
      reset();
      onClose();
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.sheetHead}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.sheetTitle}>Log a workout</Text>
          <Pressable onPress={save} hitSlop={10} disabled={saving}>
            <Text style={[styles.saveText, saving && { opacity: 0.4 }]}>Save</Text>
          </Pressable>
        </View>
        <KeyboardAwareScrollView contentContainerStyle={styles.sheetBody} bottomOffset={24} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>What</Text>
          <View style={styles.chips}>
            {WORKOUT_KINDS.map((k) => (
              <Pressable key={k.kind} onPress={() => setKind(k.kind)} style={[styles.chip, kind === k.kind && styles.chipOn]}>
                <Text style={[styles.chipText, kind === k.kind && styles.chipTextOn]}>{k.emoji} {k.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>How long</Text>
          <View style={styles.chips}>
            {WORKOUT_MINUTE_PRESETS.map((m) => {
              const on = !custom && minutes === m;
              return (
                <Pressable key={m} onPress={() => { setMinutes(m); setCustom(""); }} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{formatMinutes(m)}</Text>
                </Pressable>
              );
            })}
            <TextInput
              style={[styles.chip, styles.customInput, !!custom && styles.chipOn, !!custom && { color: colors.white }]}
              value={custom}
              onChangeText={(t) => setCustom(t.replace(/\D/g, "").slice(0, 3))}
              placeholder="Other min"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
            />
          </View>

          <Text style={styles.label}>When</Text>
          <View style={styles.chips}>
            {days.map((d, i) => (
              <Pressable key={d} onPress={() => setDate(d)} style={[styles.chip, date === d && styles.chipOn]}>
                <Text style={[styles.chipText, date === d && styles.chipTextOn]}>{dayLabel(d, i)}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Note (optional)</Text>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={(t) => setNote(t.slice(0, WORKOUT_NOTE_MAX))}
            placeholder="e.g. 5 x 400m intervals, core circuit"
            placeholderTextColor={colors.muted}
            multiline
          />
          <Text style={styles.hint}>Coaches and admins can see your notes. The leaderboard only shows counts and time.</Text>

          <Button title={saving ? "Saving…" : "Save workout"} gradient="ocean" onPress={save} disabled={saving} style={styles.saveBtn} />
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 120 },
  hero: { borderRadius: radii.xl, padding: spacing.lg, overflow: "hidden" },
  heroLabel: { color: "rgba(255,255,255,0.8)", fontSize: type.size.xs, fontWeight: type.weight.heavy, letterSpacing: type.spacing.label },
  heroBig: { color: colors.white, fontSize: type.size.xxl + 4, fontWeight: type.weight.heavy, marginTop: 4 },
  heroMeta: { color: "rgba(255,255,255,0.9)", fontSize: type.size.sm, marginTop: 2 },
  heroYou: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.35)",
  },
  heroYouText: { color: colors.white, fontSize: type.size.sm, fontWeight: type.weight.bold },
  importBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.ocean,
    backgroundColor: colors.white,
  },
  importEmoji: { fontSize: 16 },
  importText: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ocean },
  weekToggle: { flexDirection: "row", backgroundColor: colors.white, borderRadius: radii.pill, padding: 4 },
  weekBtn: { flex: 1, alignItems: "center", paddingVertical: spacing.sm, borderRadius: radii.pill },
  weekBtnOn: { backgroundColor: colors.ocean },
  weekBtnText: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.inkSoft },
  weekBtnTextOn: { color: colors.white },
  section: { fontSize: type.size.xs, fontWeight: type.weight.heavy, color: colors.muted, letterSpacing: type.spacing.label, marginLeft: spacing.xs, marginTop: spacing.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowMe: { backgroundColor: colors.ocean + "12" },
  rank: { width: 28, textAlign: "center", fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.muted },
  name: { flex: 1, fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink },
  nameMe: { color: colors.ocean },
  stat: { alignItems: "flex-end" },
  statNum: { fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.ink, ...type.mono },
  statLabel: { fontSize: type.size.xs, color: colors.muted },
  kindEmoji: { fontSize: 22 },
  meta: { fontSize: type.size.xs, color: colors.muted, marginTop: 2 },
  minutes: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.inkSoft },
  empty: { fontSize: type.size.sm, color: colors.muted, textAlign: "center", padding: spacing.lg },
  hint: { fontSize: type.size.xs, color: colors.muted, marginLeft: spacing.xs, lineHeight: 16 },
  teamPerson: { padding: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  teamName: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink },
  teamEntry: { paddingVertical: 3 },
  teamEntryText: { fontSize: type.size.sm, color: colors.inkSoft },
  lockWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm, backgroundColor: colors.bgSoft },
  lockEmoji: { fontSize: 48 },
  lockTitle: { fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.ink, textAlign: "center" },
  lockText: { fontSize: type.size.sm, color: colors.muted, textAlign: "center", lineHeight: 20 },
  lockBtn: { alignSelf: "stretch", marginTop: spacing.md },
  lockHint: { fontSize: type.size.sm, color: colors.ocean, fontWeight: type.weight.bold, marginTop: spacing.sm },
  sheet: { flex: 1, backgroundColor: colors.bgSoft },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  sheetTitle: { fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.ink },
  cancel: { fontSize: type.size.md, color: colors.muted },
  saveText: { fontSize: type.size.md, fontWeight: type.weight.heavy, color: colors.ocean },
  sheetBody: { padding: spacing.lg, paddingBottom: 80 },
  label: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.ink, marginTop: spacing.lg, marginBottom: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  chipOn: { borderColor: colors.ocean, backgroundColor: colors.ocean },
  chipText: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.ink },
  chipTextOn: { color: colors.white },
  customInput: { minWidth: 96, fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.ink },
  noteInput: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    minHeight: 70,
    fontSize: type.size.md,
    color: colors.ink,
    textAlignVertical: "top",
  },
  saveBtn: { marginTop: spacing.lg },
});
