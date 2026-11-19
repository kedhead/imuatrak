import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { isSurveyOpen, surveyWhen, type Survey } from "@/models/club";
import { currentUser } from "@/services/auth";
import { getMySurveyResponse, subscribeSurveys } from "@/services/clubService";
import { AnimatedPressable } from "./AnimatedPressable";
import { Gradient } from "./Gradient";
import { colors, radii, shadow, spacing, type } from "./theme";

/**
 * Open surveys this member hasn't answered yet, live. Read once on the club
 * home and shared by the orange card below and the badge on the header's
 * Surveys button, so the two always agree.
 */
export function useUnansweredSurveys(clubId: string | undefined): Survey[] {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  // surveyId → answered? Filled asynchronously; unknown counts as not shown.
  const [answered, setAnswered] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!clubId) return;
    return subscribeSurveys(clubId, setSurveys, () => setSurveys([]));
  }, [clubId]);

  // Answering writes only the response, not the survey doc, so the
  // subscription above doesn't fire. Re-check whenever the club home comes
  // back into view (e.g. after taking a survey) so the badge and card clear.
  const [focusTick, setFocusTick] = useState(0);
  useFocusEffect(useCallback(() => setFocusTick((n) => n + 1), []));

  useEffect(() => {
    const uid = currentUser()?.uid;
    const open = surveys.filter((s) => isSurveyOpen(s));
    if (!clubId || !uid || open.length === 0) return;
    let cancelled = false;
    void Promise.all(
      open.map(async (s) => [s.id, (await getMySurveyResponse(clubId, s, uid)).submitted] as const),
    )
      .then((pairs) => {
        if (!cancelled) setAnswered(Object.fromEntries(pairs));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [clubId, surveys, focusTick]);

  return surveys.filter((s) => isSurveyOpen(s) && answered[s.id] === false);
}

/**
 * "📋 End of season survey · Take it" on the club home feed, for open
 * surveys this member hasn't answered. Hidden once they have, so it nudges
 * without nagging. All surveys (and creating them) are behind the header's
 * Surveys button, which also carries the unanswered count.
 */
export function OpenSurveysBanner({ pending }: { pending: Survey[] }) {
  const router = useRouter();
  const first = pending[0];
  if (!first) return null;
  const more = pending.length - 1;

  return (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.wrap}>
      <AnimatedPressable
        haptic
        style={styles.shadow}
        onPress={() =>
          router.push((more > 0 ? "/club/surveys" : `/club/survey/${first.id}`) as never)
        }
      >
        <Gradient name="sunrise" style={styles.card}>
          <Text style={styles.emoji}>📋</Text>
          <View style={styles.flex}>
            <Text style={styles.title} numberOfLines={1}>
              {first.title}
            </Text>
            <Text style={styles.meta}>
              {first.questions.length} questions · {surveyWhen(first)}
              {more > 0 ? ` · +${more} more` : ""}
            </Text>
          </View>
          <View style={styles.cta}>
            <Text style={styles.ctaText}>{more > 0 ? "See all" : "Take it"}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.sunset} />
          </View>
        </Gradient>
      </AnimatedPressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  shadow: { borderRadius: radii.lg, ...shadow.md },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  flex: { flex: 1 },
  emoji: { fontSize: 26 },
  title: { fontSize: type.size.md, fontWeight: type.weight.heavy, color: colors.white },
  meta: { fontSize: type.size.xs, color: "rgba(255,255,255,0.9)", marginTop: 2 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  ctaText: { fontSize: type.size.sm, fontWeight: type.weight.heavy, color: colors.sunset },
});
