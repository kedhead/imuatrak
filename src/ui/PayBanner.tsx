import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { formatMoney, type PayItem, type PayOrder } from "@/models/payments";
import { subscribePayItems, subscribePayOrders } from "@/services/paymentService";
import { AnimatedPressable } from "./AnimatedPressable";
import { Gradient } from "./Gradient";
import { colors, radii, shadow, spacing, type } from "./theme";

/**
 * Dues & Store on the club home feed (Pro clubs only — the caller checks).
 *
 * A member who hasn't paid an open dues item gets a bright "Pay now" card;
 * otherwise, once the club sells anything, a quiet link. Treasurers always get
 * the link, with how many payments are waiting to be confirmed. Lives here
 * rather than as another header icon, like the surveys banner.
 */
export function PayBanner({ clubId, uid, isManager }: { clubId: string; uid: string; isManager: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<PayItem[]>([]);
  const [orders, setOrders] = useState<PayOrder[]>([]);

  useEffect(() => subscribePayItems(clubId, setItems, () => setItems([])), [clubId]);
  useEffect(
    () =>
      subscribePayOrders(clubId, isManager ? { all: true } : { uid }, setOrders, () => setOrders([])),
    [clubId, uid, isManager],
  );

  const active = items.filter((i) => i.active);
  const mine = orders.filter((o) => o.uid === uid && o.status !== "cancelled");
  const unpaidDues = active.find((i) => i.kind === "dues" && !mine.some((o) => o.itemId === i.id));
  const toConfirm = isManager ? orders.filter((o) => o.status === "pending").length : 0;

  if (unpaidDues) {
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

  if (!isManager && active.length === 0) return null;

  return (
    <AnimatedPressable style={styles.link} onPress={() => router.push("/club/pay" as never)}>
      <Ionicons name="card-outline" size={16} color={colors.ocean} />
      <Text style={styles.linkText}>
        Dues & Store
        {toConfirm > 0 ? ` · ${toConfirm} to confirm` : ""}
      </Text>
      {toConfirm > 0 && <View style={styles.dot} />}
      <Ionicons name="chevron-forward" size={14} color={colors.muted} style={styles.linkChevron} />
    </AnimatedPressable>
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
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.coral, marginLeft: 2 },
  linkChevron: { marginLeft: "auto" },
});
