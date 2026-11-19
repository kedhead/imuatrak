import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { formatMoney, type PayItem } from "@/models/payments";
import { AnimatedPressable } from "./AnimatedPressable";
import { Gradient } from "./Gradient";
import { colors, radii, shadow, spacing, type } from "./theme";

/**
 * "Pay now" card on the club home feed when this member hasn't paid an open
 * dues item. Everything else about payments lives behind the header's Store
 * button (which also carries the treasurer's to-confirm badge).
 */
export function PayBanner({ unpaidDues, toConfirm }: { unpaidDues: PayItem | undefined; toConfirm: number }) {
  const router = useRouter();
  if (!unpaidDues) return null;
  return (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.wrap}>
      <AnimatedPressable
        haptic
        style={styles.shadow}
        onPress={() => router.push(`/club/pay/${unpaidDues.id}` as never)}
      >
        <Gradient name="aqua" style={styles.card}>
          <Text style={styles.emoji}>🪪</Text>
          <View style={styles.flex}>
            <Text style={styles.title} numberOfLines={1}>
              {unpaidDues.title}
            </Text>
            <Text style={styles.meta}>
              {formatMoney(unpaidDues.priceCents)} · Not paid yet
              {toConfirm > 0 ? ` · ${toConfirm} to confirm` : ""}
            </Text>
          </View>
          <View style={styles.cta}>
            <Text style={styles.ctaText}>Pay now</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.success} />
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
  meta: { fontSize: type.size.xs, color: "rgba(255,255,255,0.92)", marginTop: 2 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  ctaText: { fontSize: type.size.sm, fontWeight: type.weight.heavy, color: colors.success },
});
