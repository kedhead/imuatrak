import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import {
  SURVEY_OPTION_MAX,
  SURVEY_OPTIONS_MAX,
  SURVEY_PROMPT_MAX,
  SURVEY_QUESTIONS_MAX,
  SURVEY_TEMPLATES,
  SURVEY_TITLE_MAX,
  type SurveyQuestion,
  type SurveyQuestionType,
} from "@/models/club";
import { currentUser } from "@/services/auth";
import { createSurvey, getSurvey, updateSurvey } from "@/services/clubService";
import { useClub } from "@/services/clubStore";
import { Button } from "@/ui/Button";
import { GradientCard } from "@/ui/GradientCard";
import { GradientHeader } from "@/ui/GradientHeader";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, radii, spacing, type } from "@/ui/theme";

const TYPES: { type: SurveyQuestionType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { type: "single", label: "One choice", icon: "radio-button-on" },
  { type: "multi", label: "Checkboxes", icon: "checkbox" },
  { type: "rating", label: "Rating 1–5", icon: "star" },
  { type: "text", label: "Written", icon: "create" },
];

const CLOSE_CHOICES: { label: string; days: number | null }[] = [
  { label: "No end date", days: null },
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
];

const newId = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** End of the day N days from now, so "1 week" doesn't close mid-morning. */
const closeAfter = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 0);
  return d.getTime();
};

export default function EditSurveyScreen() {
  const { id, template } = useLocalSearchParams<{ id: string; template?: string }>();
  const isNew = id === "new";
  const router = useRouter();
  const club = useClub((s) => s.club);

  // A new survey starts from its template right away; an edit loads below.
  const seed = isNew ? SURVEY_TEMPLATES.find((x) => x.id === template) : undefined;
  const [loading, setLoading] = useState(!isNew);
  const [title, setTitle] = useState(seed?.title ?? "");
  const [description, setDescription] = useState(seed?.description ?? "");
  const [anonymous, setAnonymous] = useState(seed?.anonymous ?? false);
  const [closesAt, setClosesAt] = useState<number | undefined>(undefined);
  // Which chip was tapped this session; an existing date shows as text only.
  const [closeDays, setCloseDays] = useState<number | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>(() =>
    !isNew
      ? []
      : seed
        ? seed.questions.map((q) => ({ ...q, id: newId(), options: q.options ? [...q.options] : undefined }))
        : [{ id: newId(), type: "single", prompt: "", options: ["", ""], required: true }],
  );
  const [busy, setBusy] = useState(false);

  // Editing: load the saved survey.
  useEffect(() => {
    if (isNew || !club?.id) return;
    void getSurvey(club.id, id).then((s) => {
      if (s) {
        setTitle(s.title);
        setDescription(s.description ?? "");
        setAnonymous(s.anonymous);
        setClosesAt(s.closesAt);
        setQuestions(s.questions);
      }
      setLoading(false);
    });
  }, [isNew, club?.id, id]);

  const patch = (qid: string, p: Partial<SurveyQuestion>) =>
    setQuestions((qs) => qs.map((q) => (q.id === qid ? { ...q, ...p } : q)));

  const setType = (q: SurveyQuestion, t: SurveyQuestionType) =>
    patch(q.id, {
      type: t,
      // Keep typed options when switching between the two choice kinds.
      options: t === "single" || t === "multi" ? (q.options?.length ? q.options : ["", ""]) : undefined,
    });

  const move = (i: number, dir: -1 | 1) =>
    setQuestions((qs) => {
      const j = i + dir;
      if (j < 0 || j >= qs.length) return qs;
      const next = [...qs];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const validate = (): string | null => {
    if (!title.trim()) return "Give the survey a title.";
    if (questions.length === 0) return "Add at least one question.";
    for (const [i, q] of questions.entries()) {
      if (!q.prompt.trim()) return `Question ${i + 1} needs some wording.`;
      if (q.type === "single" || q.type === "multi") {
        const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
        if (opts.length < 2) return `Question ${i + 1} needs at least two choices.`;
        if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length)
          return `Question ${i + 1} has the same choice twice.`;
      }
    }
    return null;
  };

  const save = async () => {
    const problem = validate();
    if (problem) {
      Alert.alert("Almost there", problem);
      return;
    }
    const uid = currentUser()?.uid;
    if (!club?.id || !uid) return;
    setBusy(true);
    try {
      const draft = { title, description, questions, anonymous, closesAt };
      if (isNew) {
        const newSurveyId = await createSurvey(club.id, uid, draft);
        router.replace(`/club/survey/${newSurveyId}` as never);
      } else {
        await updateSurvey(club.id, id, draft);
        router.back();
      }
    } catch (e) {
      setBusy(false);
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Please try again.");
    }
  };

  if (loading) {
    return (
      <ScreenBackground>
        <View style={styles.center}>
          <ActivityIndicator color={colors.ocean} />
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <GradientHeader title={isNew ? "New survey" : "Edit survey"} subtitle={club?.name} />
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <GradientCard>
            <TextInput
              style={styles.titleInput}
              placeholder="Survey title"
              placeholderTextColor={colors.muted}
              value={title}
              onChangeText={setTitle}
              maxLength={SURVEY_TITLE_MAX}
            />
            <TextInput
              style={[styles.input, styles.gap]}
              placeholder="A line about why you're asking (optional)"
              placeholderTextColor={colors.muted}
              value={description}
              onChangeText={setDescription}
              maxLength={500}
              multiline
            />

            <View style={[styles.switchRow, styles.gapLg]}>
              <View style={styles.flex}>
                <Text style={styles.switchLabel}>Anonymous</Text>
                <Text style={styles.switchHint}>
                  {isNew
                    ? "Coaches see answers but not who gave them. Can't be changed after publishing."
                    : `This survey is ${anonymous ? "anonymous" : "named"}. That can't change now that it's published.`}
                </Text>
              </View>
              <Switch value={anonymous} onValueChange={setAnonymous} disabled={!isNew} />
            </View>

            <Text style={[styles.fieldLabel, styles.gapLg]}>CLOSES</Text>
            <View style={styles.chips}>
              {CLOSE_CHOICES.map((c) => {
                const on = c.days == null ? closesAt == null : closeDays === c.days;
                return (
                  <Pressable
                    key={c.label}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => {
                      setCloseDays(c.days);
                      setClosesAt(c.days == null ? undefined : closeAfter(c.days));
                    }}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {closesAt != null && (
              <Text style={styles.switchHint}>
                Closes {new Date(closesAt).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} at midnight
              </Text>
            )}
          </GradientCard>

          {questions.map((q, i) => (
            <GradientCard key={q.id}>
              <View style={styles.qHead}>
                <Text style={styles.qNum}>QUESTION {i + 1}</Text>
                <View style={styles.qTools}>
                  <Pressable hitSlop={6} onPress={() => move(i, -1)} disabled={i === 0}>
                    <Ionicons name="arrow-up" size={18} color={i === 0 ? colors.line : colors.muted} />
                  </Pressable>
                  <Pressable hitSlop={6} onPress={() => move(i, 1)} disabled={i === questions.length - 1}>
                    <Ionicons
                      name="arrow-down"
                      size={18}
                      color={i === questions.length - 1 ? colors.line : colors.muted}
                    />
                  </Pressable>
                  <Pressable
                    hitSlop={6}
                    onPress={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                </View>
              </View>

              <TextInput
                style={styles.input}
                placeholder="Ask something…"
                placeholderTextColor={colors.muted}
                value={q.prompt}
                onChangeText={(t) => patch(q.id, { prompt: t })}
                maxLength={SURVEY_PROMPT_MAX}
                multiline
              />

              <View style={[styles.chips, styles.gap]}>
                {TYPES.map((t) => {
                  const on = q.type === t.type;
                  return (
                    <Pressable key={t.type} style={[styles.chip, on && styles.chipOn]} onPress={() => setType(q, t.type)}>
                      <Ionicons name={t.icon} size={13} color={on ? colors.white : colors.muted} />
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{t.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {(q.type === "single" || q.type === "multi") && (
                <View style={styles.gap}>
                  {(q.options ?? []).map((o, oi) => (
                    <View key={oi} style={styles.optionRow}>
                      <Ionicons
                        name={q.type === "multi" ? "square-outline" : "radio-button-off"}
                        size={18}
                        color={colors.muted}
                      />
                      <TextInput
                        style={[styles.input, styles.flex]}
                        placeholder={`Choice ${oi + 1}`}
                        placeholderTextColor={colors.muted}
                        value={o}
                        onChangeText={(t) =>
                          patch(q.id, { options: (q.options ?? []).map((x, xi) => (xi === oi ? t : x)) })
                        }
                        maxLength={SURVEY_OPTION_MAX}
                      />
                      {(q.options ?? []).length > 2 && (
                        <Pressable
                          hitSlop={6}
                          onPress={() => patch(q.id, { options: (q.options ?? []).filter((_, xi) => xi !== oi) })}
                        >
                          <Ionicons name="close" size={18} color={colors.muted} />
                        </Pressable>
                      )}
                    </View>
                  ))}
                  {(q.options ?? []).length < SURVEY_OPTIONS_MAX && (
                    <Pressable
                      style={styles.addChoice}
                      onPress={() => patch(q.id, { options: [...(q.options ?? []), ""] })}
                    >
                      <Ionicons name="add" size={16} color={colors.ocean} />
                      <Text style={styles.addChoiceText}>Add a choice</Text>
                    </Pressable>
                  )}
                </View>
              )}

              <View style={[styles.switchRow, styles.gap]}>
                <Text style={[styles.switchHint, styles.flex]}>Required</Text>
                <Switch value={q.required} onValueChange={(v) => patch(q.id, { required: v })} />
              </View>
            </GradientCard>
          ))}

          {questions.length < SURVEY_QUESTIONS_MAX && (
            <Pressable
              style={styles.addQuestion}
              onPress={() =>
                setQuestions((qs) => [...qs, { id: newId(), type: "rating", prompt: "", required: false }])
              }
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.ocean} />
              <Text style={styles.addQuestionText}>Add a question</Text>
            </Pressable>
          )}

          <Button
            title={busy ? "Saving…" : isNew ? "Publish to the club" : "Save changes"}
            gradient="sunrise"
            glow
            disabled={busy}
            onPress={() => void save()}
            style={styles.save}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 160 },
  gap: { marginTop: spacing.sm },
  gapLg: { marginTop: spacing.lg },
  titleInput: { fontSize: type.size.xl, fontWeight: type.weight.heavy, color: colors.ink, paddingVertical: spacing.xs },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: type.size.md,
    color: colors.ink,
  },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  switchLabel: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink },
  switchHint: { fontSize: type.size.xs, color: colors.muted, marginTop: 2, lineHeight: 17 },
  fieldLabel: { fontSize: type.size.xs, fontWeight: type.weight.heavy, color: colors.muted, letterSpacing: type.spacing.label, marginBottom: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  chipOn: { backgroundColor: colors.ocean, borderColor: colors.ocean },
  chipText: { fontSize: type.size.sm, color: colors.inkSoft, fontWeight: type.weight.medium },
  chipTextOn: { color: colors.white },
  qHead: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  qNum: { flex: 1, fontSize: type.size.xs, fontWeight: type.weight.heavy, color: colors.muted, letterSpacing: type.spacing.label },
  qTools: { flexDirection: "row", gap: spacing.md },
  optionRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  addChoice: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: spacing.xs, marginLeft: 26 },
  addChoiceText: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.ocean },
  addQuestion: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.ocean + "66",
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
  },
  addQuestionText: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ocean },
  save: { marginTop: spacing.md },
});
