import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { isSurveyOpen, surveyWhen, type Survey } from "@/models/club";
import { currentUser } from "@/services/auth";
import { getMySurveyResponse, subscribeSurveys } from "@/services/clubService";
import { AnimatedPressable } from "./AnimatedPressable";
import { Gradient } from "./Gradient";
import { colors, radii, shadow, spacing, type } from "./theme";

/**
 * "📋 End of season survey · Take it" on the club home feed, for open
 * surveys this member hasn't answered. Hidden once they have, so it nudges
 * without nagging. Surveys live behind this card rather than another header
 * icon — the club header is already full on small phones.
 */
export function OpenSurveysBanner({ clubId, isStaff }: { clubId: string; isStaff: boolean }) {
  const router = useRouter();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  // surveyId → answered? Filled asynchronously; unknown counts as not shown.
  const [answered, setAnswered] = useState<Record<string, boolean>>({});

  useEffect(() => subscribeSurveys(clubId, setSurveys, () => setSurveys([])), [clubId]);

  useEffect(() => {
    const uid = currentUser()?.uid;
    const open = surveys.filter((s) => isSurveyOpen(s));
    if (!uid || open.length === 0) return;
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
  }, [clubId, surveys]);

  const pending = surveys.filter((s) => isSurveyOpen(s) && answered[s.id] === false);
  const first = pending[0];
  if (!first) {
    // Staff (coaches included — they can't open Club Settings) always get a
    // quiet way in, to create surveys and check results.
    if (!isStaff) return null;
    const openCount = surveys.filter((s) => isSurveyOpen(s)).length;
    return (
      <AnimatedPressable style={styles.link} onPress={() => router.push("/club/surveys" as never)}>
        <Ionicons name="clipboard-outline" size={16} color={colors.ocean} />
        <Text style={styles.linkText}>
          Surveys{openCount > 0 ? ` · ${openCount} open` : ""}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={colors.muted} style={styles.linkChevron} />
      </AnimatedPressable>
    );
  }
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
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    ...shadow.sm,
  },
  linkText: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.ocean },
  linkChevron: { marginLeft: "auto" },
});
