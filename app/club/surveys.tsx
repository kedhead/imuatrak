import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { isSurveyOpen, SURVEY_TEMPLATES, surveyWhen, type Survey } from "@/models/club";
import { currentUser } from "@/services/auth";
import { getMySurveyResponse, subscribeSurveys } from "@/services/clubService";
import { useClub } from "@/services/clubStore";
import { AnimatedPressable } from "@/ui/AnimatedPressable";
import { Button } from "@/ui/Button";
import { GradientCard } from "@/ui/GradientCard";
import { GradientHeader } from "@/ui/GradientHeader";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, radii, spacing, type } from "@/ui/theme";

export default function SurveysScreen() {
  const router = useRouter();
  const club = useClub((s) => s.club);
  const role = useClub((s) => s.role);
  const isStaff = role === "owner" || role === "admin" || role === "coach";
  const [surveys, setSurveys] = useState<Survey[] | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [picker, setPicker] = useState(false);

  const clubId = club?.id;
  useEffect(() => {
    if (!clubId) return;
    return subscribeSurveys(clubId, setSurveys, () => setSurveys([]));
  }, [clubId]);

  // Which open ones I've already answered, for the "Done" tick.
  useEffect(() => {
    const uid = currentUser()?.uid;
    if (!clubId || !uid || !surveys) return;
    let cancelled = false;
    void Promise.all(
      surveys
        .filter((s) => isSurveyOpen(s))
        .map(async (s) => [s.id, (await getMySurveyResponse(clubId, s, uid)).submitted] as const),
    ).then((pairs) => {
      if (!cancelled) setDone(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [clubId, surveys]);

  if (!club) return null;

  const open = (surveys ?? []).filter((s) => isSurveyOpen(s));
  const closed = (surveys ?? []).filter((s) => !isSurveyOpen(s));

  const startNew = (templateId?: string) => {
    setPicker(false);
    router.push(`/club/survey-edit/new${templateId ? `?template=${templateId}` : ""}` as never);
  };

  const row = (s: Survey, i: number) => (
    <Animated.View key={s.id} entering={FadeInDown.delay(i * 40).duration(300)}>
      <AnimatedPressable
        style={styles.row}
        onPress={() => router.push(`/club/survey/${s.id}` as never)}
      >
        <View style={[styles.icon, !isSurveyOpen(s) && { backgroundColor: colors.bg }]}>
          <Ionicons name="clipboard-outline" size={20} color={isSurveyOpen(s) ? colors.white : colors.muted} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.rowTitle} numberOfLines={1}>{s.title}</Text>
          <Text style={styles.rowMeta}>
            {s.questions.length} question{s.questions.length === 1 ? "" : "s"} · {surveyWhen(s)}
            {s.anonymous ? " · Anonymous" : ""}
          </Text>
        </View>
        {done[s.id] ? (
          <View style={styles.doneTag}>
            <Ionicons name="checkmark" size={12} color={colors.success} />
            <Text style={styles.doneText}>Done</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        )}
      </AnimatedPressable>
    </Animated.View>
  );

  return (
    <ScreenBackground>
      <GradientHeader
        title="Surveys"
        subtitle={club.name}
        right={
          isStaff ? (
            <AnimatedPressable onPress={() => setPicker(true)} hitSlop={8}>
              <Ionicons name="add-circle" size={28} color={colors.white} />
            </AnimatedPressable>
          ) : undefined
        }
      />

      {surveys === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.ocean} />
        </View>
      ) : surveys.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={styles.emptyTitle}>No surveys yet</Text>
          <Text style={styles.emptyBody}>
            {isStaff
              ? "Ask the crew how the season went, get race feedback, or find practice times that work."
              : "When your coaches send out a survey, it'll show up here."}
          </Text>
          {isStaff && (
            <Button title="✨ Create a survey" gradient="sunrise" onPress={() => setPicker(true)} style={styles.emptyBtn} />
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {open.length > 0 && <Text style={styles.sectionLabel}>OPEN</Text>}
          {open.length > 0 && <GradientCard padded={false}>{open.map(row)}</GradientCard>}
          {closed.length > 0 && <Text style={styles.sectionLabel}>CLOSED</Text>}
          {closed.length > 0 && <GradientCard padded={false}>{closed.map(row)}</GradientCard>}
        </ScrollView>
      )}

      <Modal visible={picker} transparent animationType="slide" onRequestClose={() => setPicker(false)}>
        <Pressable style={styles.overlay} onPress={() => setPicker(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>New survey</Text>
            {SURVEY_TEMPLATES.map((t) => (
              <AnimatedPressable key={t.id} haptic style={styles.templateRow} onPress={() => startNew(t.id)}>
                <Text style={styles.templateEmoji}>{t.emoji}</Text>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>{t.name}</Text>
                  <Text style={styles.rowMeta}>
                    {t.blurb} · {t.questions.length} questions
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </AnimatedPressable>
            ))}
            <AnimatedPressable haptic style={styles.templateRow} onPress={() => startNew()}>
              <Text style={styles.templateEmoji}>📝</Text>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>Start from scratch</Text>
                <Text style={styles.rowMeta}>Write your own questions</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </AnimatedPressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 120 },
  sectionLabel: {
    fontSize: type.size.xs,
    fontWeight: type.weight.heavy,
    color: colors.muted,
    letterSpacing: type.spacing.label,
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.ocean,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink },
  rowMeta: { fontSize: type.size.xs, color: colors.muted, marginTop: 2 },
  doneTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.success + "1A",
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  doneText: { fontSize: type.size.xs, fontWeight: type.weight.bold, color: colors.success },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.ink, marginTop: spacing.sm },
  emptyBody: { fontSize: type.size.sm, color: colors.muted, textAlign: "center", lineHeight: 20, marginTop: spacing.xs },
  emptyBtn: { alignSelf: "stretch", marginTop: spacing.lg },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sheetTitle: { fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.ink, marginBottom: spacing.sm },
  templateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  templateEmoji: { fontSize: 28 },
});
