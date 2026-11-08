import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  isSurveyOpen,
  surveyToCsv,
  surveyWhen,
  tallyQuestion,
  type QuestionResult,
  type Survey,
  type SurveyResponse,
} from "@/models/club";
import { currentUser } from "@/services/auth";
import {
  deleteSurvey,
  getSurvey,
  getSurveyRespondentUids,
  getSurveyResponses,
  setSurveyStatus,
} from "@/services/clubService";
import { useClub } from "@/services/clubStore";
import { Button } from "@/ui/Button";
import { GradientCard } from "@/ui/GradientCard";
import { GradientHeader } from "@/ui/GradientHeader";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, radii, spacing, type } from "@/ui/theme";

export default function SurveyResultsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const club = useClub((s) => s.club);
  const role = useClub((s) => s.role);
  const members = useClub((s) => s.members);
  const [survey, setSurvey] = useState<Survey | null | undefined>(undefined);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [respondents, setRespondents] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const clubId = club?.id;
  const fetchAll = useCallback(async () => {
    if (!clubId || !id) return null;
    const s = await getSurvey(clubId, id);
    if (!s) return { survey: null, responses: [], respondents: [] };
    const [r, who] = await Promise.all([getSurveyResponses(clubId, id), getSurveyRespondentUids(clubId, s)]);
    return { survey: s, responses: r, respondents: who };
  }, [clubId, id]);

  const apply = (d: Awaited<ReturnType<typeof fetchAll>>) => {
    if (!d) return;
    setSurvey(d.survey);
    setResponses(d.responses);
    setRespondents(d.respondents);
  };
  const load = async () => apply(await fetchAll());

  useEffect(() => {
    let cancelled = false;
    void fetchAll().then((d) => {
      if (cancelled || !d) return;
      setSurvey(d.survey);
      setResponses(d.responses);
      setRespondents(d.respondents);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  if (survey === undefined) {
    return (
      <ScreenBackground>
        <View style={styles.center}>
          <ActivityIndicator color={colors.ocean} />
        </View>
      </ScreenBackground>
    );
  }
  if (!survey || !clubId) {
    return (
      <ScreenBackground>
        <View style={styles.center}>
          <Text style={styles.muted}>Survey not found</Text>
        </View>
      </ScreenBackground>
    );
  }

  const open = isSurveyOpen(survey);
  const answeredSet = new Set(respondents);
  const waiting = members.filter((m) => !answeredSet.has(m.uid));
  const canDelete =
    role === "owner" || role === "admin" || survey.createdBy === currentUser()?.uid;

  const toggleOpen = async () => {
    setBusy(true);
    try {
      await setSurveyStatus(clubId, survey.id, open ? "closed" : "open");
      await load();
    } catch (e) {
      Alert.alert("Couldn't update", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const share = () =>
    void Share.share({ title: survey.title, message: surveyToCsv(survey, responses) });

  const remove = () =>
    Alert.alert(
      "Delete this survey?",
      `Its ${responses.length} response${responses.length === 1 ? "" : "s"} will be deleted too. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await deleteSurvey(clubId, survey.id);
              router.dismissTo("/club/surveys" as never);
            } catch (e) {
              setBusy(false);
              Alert.alert("Couldn't delete", e instanceof Error ? e.message : "Please try again.");
            }
          },
        },
      ],
    );

  return (
    <ScreenBackground>
      <GradientHeader title="Results" subtitle={survey.title} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <GradientCard>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{responses.length}</Text>
              <Text style={styles.statLabel}>responses</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: colors.muted }]}>{waiting.length}</Text>
              <Text style={styles.statLabel}>not yet</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: open ? colors.success : colors.muted, fontSize: type.size.lg }]}>
                {open ? "Open" : "Closed"}
              </Text>
              <Text style={styles.statLabel}>{survey.anonymous ? "anonymous" : surveyWhen(survey)}</Text>
            </View>
          </View>
          {waiting.length > 0 && open && (
            <Text style={styles.waiting} numberOfLines={3}>
              Still waiting on {waiting.map((m) => m.displayName.split(" ")[0]).join(", ")}
            </Text>
          )}
          <View style={styles.actions}>
            <Button
              title={open ? "Close survey" : "Reopen"}
              variant="outline"
              disabled={busy}
              onPress={() => void toggleOpen()}
              style={styles.actionBtn}
            />
            <Button
              title="Share CSV"
              variant="outline"
              disabled={responses.length === 0}
              onPress={share}
              style={styles.actionBtn}
            />
          </View>
        </GradientCard>

        {responses.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>⏳</Text>
            <Text style={styles.muted}>No responses yet. Results show up here as they come in.</Text>
          </View>
        ) : (
          survey.questions.map((q, i) => (
            <Animated.View key={q.id} entering={FadeInDown.delay(i * 40).duration(300)}>
              <GradientCard>
                <Text style={styles.qNum}>Question {i + 1}</Text>
                <Text style={styles.qPrompt}>{q.prompt}</Text>
                <ResultView result={tallyQuestion(q, responses)} total={responses.length} />
              </GradientCard>
            </Animated.View>
          ))
        )}

        {canDelete && (
          <Button title="Delete survey" variant="danger" disabled={busy} onPress={remove} style={styles.delete} />
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

function Bar({ label, count, of, color = colors.ocean }: { label: string; count: number; of: number; color?: string }) {
  const pct = of > 0 ? Math.round((count / of) * 100) : 0;
  return (
    <View style={styles.bar}>
      <View style={styles.barHead}>
        <Text style={styles.barLabel} numberOfLines={2}>{label}</Text>
        <Text style={styles.barCount}>
          {count} · {pct}%
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function ResultView({ result, total }: { result: QuestionResult; total: number }) {
  const skipped = total - result.answered;
  const footer = skipped > 0 ? <Text style={styles.skipped}>{skipped} skipped</Text> : null;
  switch (result.type) {
    case "single":
    case "multi":
      return (
        <View style={styles.bars}>
          {[...result.counts]
            .sort((a, b) => b.count - a.count)
            .map((c) => (
              <Bar key={c.option} label={c.option} count={c.count} of={result.answered} />
            ))}
          {footer}
        </View>
      );
    case "rating":
      return (
        <View style={styles.bars}>
          <Text style={styles.avg}>
            {result.average ?? "–"}
            <Text style={styles.avgOf}> / 5 average</Text>
          </Text>
          {result.counts
            .map((count, i) => ({ count, v: i + 1 }))
            .reverse()
            .map(({ count, v }) => (
              <Bar key={v} label={`${v}`} count={count} of={result.answered} color={colors.sunset} />
            ))}
          {footer}
        </View>
      );
    case "text":
      return (
        <View style={styles.texts}>
          {result.answers.length === 0 ? (
            <Text style={styles.muted}>No written answers.</Text>
          ) : (
            result.answers.map((a, i) => (
              <View key={i} style={styles.textAnswer}>
                <Text style={styles.textBody} selectable>{a.text}</Text>
                {a.name ? <Text style={styles.textName}>— {a.name}</Text> : null}
              </View>
            ))
          )}
          {footer}
        </View>
      );
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontSize: type.size.sm, textAlign: "center" },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 140 },
  statsRow: { flexDirection: "row" },
  stat: { flex: 1, alignItems: "center" },
  statNum: { fontSize: type.size.display, fontWeight: type.weight.heavy, color: colors.ocean, ...type.mono },
  statLabel: { fontSize: type.size.xs, color: colors.muted, marginTop: 2 },
  waiting: { fontSize: type.size.sm, color: colors.muted, marginTop: spacing.md, textAlign: "center" },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  actionBtn: { flex: 1, minHeight: 44 },
  empty: { alignItems: "center", padding: spacing.xl, gap: spacing.sm },
  emptyEmoji: { fontSize: 36 },
  qNum: { fontSize: type.size.xs, fontWeight: type.weight.bold, color: colors.muted },
  qPrompt: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink, marginTop: 2, marginBottom: spacing.md },
  bars: { gap: spacing.sm },
  bar: { gap: 4 },
  barHead: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  barLabel: { flex: 1, fontSize: type.size.sm, color: colors.ink },
  barCount: { fontSize: type.size.sm, color: colors.muted, ...type.mono },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.bg, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  avg: { fontSize: type.size.xxl, fontWeight: type.weight.heavy, color: colors.ink, ...type.mono },
  avgOf: { fontSize: type.size.sm, fontWeight: type.weight.regular, color: colors.muted },
  skipped: { fontSize: type.size.xs, color: colors.muted, fontStyle: "italic" },
  texts: { gap: spacing.sm },
  textAnswer: { backgroundColor: colors.bg, borderRadius: radii.md, padding: spacing.md },
  textBody: { fontSize: type.size.md, color: colors.ink, lineHeight: 21 },
  textName: { fontSize: type.size.xs, color: colors.muted, marginTop: 4 },
  delete: { marginTop: spacing.lg, minHeight: 44 },
});
