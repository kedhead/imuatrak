import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import {
  cleanAnswers,
  isSurveyOpen,
  missingRequired,
  SURVEY_RATING_MAX,
  SURVEY_TEXT_ANSWER_MAX,
  surveyWhen,
  type Survey,
  type SurveyAnswer,
  type SurveyQuestion,
} from "@/models/club";
import { currentUser } from "@/services/auth";
import { getMySurveyResponse, getSurvey, submitSurveyResponse } from "@/services/clubService";
import { useClub } from "@/services/clubStore";
import { AnimatedPressable } from "@/ui/AnimatedPressable";
import { Button } from "@/ui/Button";
import { GradientCard } from "@/ui/GradientCard";
import { GradientHeader } from "@/ui/GradientHeader";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, radii, spacing, type } from "@/ui/theme";

const RATING_WORDS = ["Poor", "Fair", "Good", "Great", "Excellent"];

export default function TakeSurveyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const club = useClub((s) => s.club);
  const role = useClub((s) => s.role);
  const members = useClub((s) => s.members);
  const isStaff = role === "owner" || role === "admin" || role === "coach";
  const me = currentUser();

  const [survey, setSurvey] = useState<Survey | null | undefined>(undefined);
  const [answers, setAnswers] = useState<Record<string, SurveyAnswer>>({});
  const [submitted, setSubmitted] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const clubId = club?.id;
  const uid = me?.uid;
  useEffect(() => {
    if (!clubId || !id || !uid) return;
    void (async () => {
      const s = await getSurvey(clubId, id);
      setSurvey(s);
      if (!s) return;
      const mine = await getMySurveyResponse(clubId, s, uid);
      setSubmitted(mine.submitted);
      if (mine.answers) setAnswers(mine.answers);
    })();
  }, [clubId, id, uid]);

  if (survey === undefined) {
    return (
      <ScreenBackground>
        <View style={styles.center}>
          <ActivityIndicator color={colors.ocean} />
        </View>
      </ScreenBackground>
    );
  }
  if (!survey || !clubId || !me) {
    return (
      <ScreenBackground>
        <View style={styles.center}>
          <Text style={styles.muted}>Survey not found</Text>
        </View>
      </ScreenBackground>
    );
  }

  const open = isSurveyOpen(survey);
  // Anonymous answers can't be found again, so once sent they're final.
  const locked = !open || (survey.anonymous && submitted);
  const set = (qid: string, a: SurveyAnswer) => setAnswers((prev) => ({ ...prev, [qid]: a }));

  const submit = async () => {
    const missing = missingRequired(survey.questions, answers);
    if (missing.length > 0) {
      Alert.alert(
        "A few more answers needed",
        missing.map((p) => `• ${p}`).join("\n"),
      );
      return;
    }
    const finish = async () => {
      setBusy(true);
      try {
        const name =
          members.find((m) => m.uid === me.uid)?.displayName ?? me.displayName ?? "A member";
        await submitSurveyResponse(clubId, survey, me.uid, name, cleanAnswers(survey.questions, answers));
        setSubmitted(true);
        setJustSent(true);
      } catch (e) {
        Alert.alert(
          "Couldn't send",
          survey.anonymous && submitted
            ? "You've already answered this survey."
            : e instanceof Error ? e.message : "Please try again.",
        );
      } finally {
        setBusy(false);
      }
    };
    if (survey.anonymous) {
      Alert.alert("Send your answers?", "This survey is anonymous, so you won't be able to change them afterwards.", [
        { text: "Keep editing", style: "cancel" },
        { text: "Send", onPress: () => void finish() },
      ]);
    } else {
      await finish();
    }
  };

  return (
    <ScreenBackground>
      <GradientHeader
        title={survey.title}
        subtitle={surveyWhen(survey)}
        right={
          isStaff ? (
            <View style={styles.headerActions}>
              <Pressable onPress={() => router.push(`/club/survey-results/${survey.id}` as never)} hitSlop={8}>
                <Ionicons name="bar-chart-outline" size={22} color={colors.white} />
              </Pressable>
              <Pressable onPress={() => router.push(`/club/survey-edit/${survey.id}` as never)} hitSlop={8}>
                <Ionicons name="pencil-outline" size={20} color={colors.white} />
              </Pressable>
            </View>
          ) : undefined
        }
      />
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {survey.description ? <Text style={styles.description}>{survey.description}</Text> : null}

          <View style={[styles.notice, survey.anonymous && styles.noticeAnon]}>
            <Ionicons
              name={survey.anonymous ? "lock-closed" : "person-circle-outline"}
              size={16}
              color={survey.anonymous ? colors.success : colors.muted}
            />
            <Text style={styles.noticeText}>
              {survey.anonymous
                ? "Anonymous: your coaches see the answers, but not who gave them."
                : "Your name is shown with your answers."}
            </Text>
          </View>

          {justSent ? (
            <Animated.View entering={FadeIn} style={styles.thanks}>
              <Text style={styles.thanksEmoji}>🤙</Text>
              <Text style={styles.thanksTitle}>Mahalo!</Text>
              <Text style={styles.thanksBody}>
                {survey.anonymous
                  ? "Your answers are in, anonymously."
                  : "Your answers are in. You can come back and change them until the survey closes."}
              </Text>
              <Button title="Done" gradient="aqua" onPress={() => router.back()} style={styles.thanksBtn} />
            </Animated.View>
          ) : locked ? (
            <GradientCard>
              <View style={styles.lockedRow}>
                <Ionicons
                  name={submitted ? "checkmark-circle" : "time-outline"}
                  size={22}
                  color={submitted ? colors.success : colors.muted}
                />
                <Text style={styles.lockedText}>
                  {submitted
                    ? "You've answered this survey. Thanks!"
                    : "This survey is closed."}
                </Text>
              </View>
              {isStaff && (
                <Button
                  title="See results"
                  variant="outline"
                  onPress={() => router.push(`/club/survey-results/${survey.id}` as never)}
                  style={styles.lockedBtn}
                />
              )}
            </GradientCard>
          ) : (
            <>
              {survey.questions.map((q, i) => (
                <Animated.View key={q.id} entering={FadeInDown.delay(i * 40).duration(300)}>
                  <GradientCard>
                    <Text style={styles.qNum}>
                      {i + 1} of {survey.questions.length}
                      {q.required ? "" : " · optional"}
                    </Text>
                    <Text style={styles.qPrompt}>{q.prompt}</Text>
                    <QuestionInput q={q} value={answers[q.id]} onChange={(a) => set(q.id, a)} />
                  </GradientCard>
                </Animated.View>
              ))}
              <Button
                title={busy ? "Sending…" : submitted ? "Update my answers" : "Send answers"}
                gradient="sunrise"
                glow
                disabled={busy}
                onPress={() => void submit()}
                style={styles.submit}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

function QuestionInput({
  q,
  value,
  onChange,
}: {
  q: SurveyQuestion;
  value: SurveyAnswer | undefined;
  onChange: (a: SurveyAnswer) => void;
}) {
  switch (q.type) {
    case "single":
    case "multi": {
      const multi = q.type === "multi";
      const picked = multi ? ((value as string[] | undefined) ?? []) : [value as string | undefined];
      return (
        <View style={styles.options}>
          {multi && <Text style={styles.hint}>Pick any that apply</Text>}
          {(q.options ?? []).map((o) => {
            const on = picked.includes(o);
            return (
              <AnimatedPressable
                key={o}
                haptic
                style={[styles.option, on && styles.optionOn]}
                onPress={() =>
                  onChange(
                    multi
                      ? on
                        ? (picked as string[]).filter((x) => x !== o)
                        : [...(picked as string[]), o]
                      : o,
                  )
                }
              >
                <Ionicons
                  name={
                    multi
                      ? on ? "checkbox" : "square-outline"
                      : on ? "radio-button-on" : "radio-button-off"
                  }
                  size={20}
                  color={on ? colors.ocean : colors.muted}
                />
                <Text style={[styles.optionText, on && styles.optionTextOn]}>{o}</Text>
              </AnimatedPressable>
            );
          })}
        </View>
      );
    }
    case "rating": {
      const n = typeof value === "number" ? value : 0;
      return (
        <View>
          <View style={styles.ratingRow}>
            {Array.from({ length: SURVEY_RATING_MAX }, (_, i) => i + 1).map((v) => (
              <AnimatedPressable
                key={v}
                haptic
                style={[styles.ratingDot, v <= n && styles.ratingDotOn]}
                onPress={() => onChange(v)}
              >
                <Text style={[styles.ratingNum, v <= n && styles.ratingNumOn]}>{v}</Text>
              </AnimatedPressable>
            ))}
          </View>
          <Text style={styles.ratingWord}>{n > 0 ? RATING_WORDS[n - 1] : "Tap a number"}</Text>
        </View>
      );
    }
    case "text":
      return (
        <TextInput
          style={styles.textInput}
          placeholder="Your answer"
          placeholderTextColor={colors.muted}
          value={typeof value === "string" ? value : ""}
          onChangeText={onChange}
          multiline
          maxLength={SURVEY_TEXT_ANSWER_MAX}
        />
      );
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 140 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  description: { fontSize: type.size.md, color: colors.inkSoft, lineHeight: 22 },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  noticeAnon: { backgroundColor: colors.success + "18" },
  noticeText: { flex: 1, fontSize: type.size.sm, color: colors.inkSoft },
  qNum: { fontSize: type.size.xs, fontWeight: type.weight.bold, color: colors.muted, letterSpacing: 0.5 },
  qPrompt: { fontSize: type.size.lg, fontWeight: type.weight.bold, color: colors.ink, marginTop: 4, marginBottom: spacing.md },
  hint: { fontSize: type.size.xs, color: colors.muted, marginBottom: 2 },
  options: { gap: spacing.xs },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  optionOn: { borderColor: colors.ocean, backgroundColor: colors.ocean + "0F" },
  optionText: { flex: 1, fontSize: type.size.md, color: colors.ink },
  optionTextOn: { fontWeight: type.weight.bold },
  ratingRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.xs },
  ratingDot: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 56,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  ratingDotOn: { backgroundColor: colors.sunset, borderColor: colors.sunset },
  ratingNum: { fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.muted },
  ratingNumOn: { color: colors.white },
  ratingWord: { textAlign: "center", fontSize: type.size.sm, color: colors.muted, marginTop: spacing.sm },
  textInput: {
    minHeight: 96,
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: type.size.md,
    color: colors.ink,
    textAlignVertical: "top",
  },
  submit: { marginTop: spacing.md },
  lockedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  lockedText: { flex: 1, fontSize: type.size.md, color: colors.ink },
  lockedBtn: { marginTop: spacing.md },
  thanks: { alignItems: "center", paddingVertical: spacing.xxl },
  thanksEmoji: { fontSize: 56 },
  thanksTitle: { fontSize: type.size.xxl, fontWeight: type.weight.heavy, color: colors.ink, marginTop: spacing.sm },
  thanksBody: { fontSize: type.size.md, color: colors.muted, textAlign: "center", marginTop: spacing.xs, lineHeight: 22 },
  thanksBtn: { alignSelf: "stretch", marginTop: spacing.xl },
});
