import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { AnimatedPressable } from "./AnimatedPressable";
import { colors, radii, spacing, type } from "./theme";

interface Action {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Filled icon when something's waiting. */
  activeIcon?: keyof typeof Ionicons.glyphMap;
  href: string;
  /** A number shows a count; true shows a dot. */
  badge?: number | boolean;
}

/**
 * The club home's shortcuts (up to seven), spread edge to edge under the club name: labeled
 * so new members can tell what's what, and moved off the title row so a long
 * club name fits. Members (and Invite, on its screen) and Settings sit in the
 * header's top-right corner.
 */
export function ClubActionBar({
  chatUnread,
  surveysUnanswered,
  showStore,
  showTraining,
  storeBadge,
}: {
  chatUnread: number;
  /** Open surveys this member hasn't answered. */
  surveysUnanswered: number;
  /** Pro clubs (and owners/admins of free clubs, who see the upgrade). */
  showStore: boolean;
  /** Training log — Pro clubs. */
  showTraining: boolean;
  storeBadge?: number | boolean;
}) {
  const router = useRouter();
  const actions: Action[] = [
    { key: "chat", label: "Chat", icon: "chatbubbles-outline", activeIcon: "chatbubbles", href: "/club/channels", badge: chatUnread },
    { key: "events", label: "Events", icon: "calendar-outline", href: "/club/events" },
    { key: "photos", label: "Photos", icon: "images-outline", href: "/club/gallery" },
    { key: "surveys", label: "Surveys", icon: "clipboard-outline", activeIcon: "clipboard", href: "/club/surveys", badge: surveysUnanswered },
    ...(showTraining
      ? [{ key: "training", label: "Train", icon: "barbell-outline", href: "/club/training" } as Action]
      : []),
    ...(showStore
      ? [{ key: "store", label: "Store", icon: "card-outline", activeIcon: "card", href: "/club/pay", badge: storeBadge } as Action]
      : []),
  ];

  return (
    <View style={styles.bar}>
      {actions.map((a) => {
        const lit = typeof a.badge === "number" ? a.badge > 0 : !!a.badge;
        return (
          <AnimatedPressable
            key={a.key}
            haptic
            style={styles.item}
            onPress={() => router.push(a.href as never)}
            accessibilityRole="button"
            accessibilityLabel={
              typeof a.badge === "number" && a.badge > 0 ? `${a.label}, ${a.badge} new` : a.label
            }
          >
            <View style={[styles.iconWrap, lit && styles.iconWrapLit]}>
              <Ionicons name={lit && a.activeIcon ? a.activeIcon : a.icon} size={22} color={colors.white} />
              {lit &&
                (typeof a.badge === "number" ? (
                  <View style={styles.count}>
                    <Text style={styles.countText}>{a.badge > 9 ? "9+" : a.badge}</Text>
                  </View>
                ) : (
                  <View style={styles.dot} />
                ))}
            </View>
            <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {a.label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    // Slightly wider than the header padding so seven tiles fit on a 375pt phone.
    marginHorizontal: -spacing.sm,
  },
  item: { flex: 1, alignItems: "center", gap: 6, paddingVertical: 2 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapLit: { backgroundColor: "rgba(255,255,255,0.26)" },
  label: { color: "rgba(255,255,255,0.92)", fontSize: type.size.xs, fontWeight: type.weight.bold },
  count: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.coral,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.oceanDeep,
  },
  countText: { color: colors.white, fontSize: 10, fontWeight: type.weight.heavy },
  dot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.coral,
    borderWidth: 1.5,
    borderColor: colors.oceanDeep,
  },
});
