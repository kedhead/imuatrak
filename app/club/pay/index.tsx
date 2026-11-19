import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { clubIsPro } from "@/models/club";
import {
  canManagePayments,
  formatMoney,
  isSoldOut,
  orderTotals,
  PAY_ITEM_KIND_INFO,
  remainingStock,
  sortOrders,
  sortPayItems,
  type PayItem,
  type PayOrder,
} from "@/models/payments";
import { currentUser } from "@/services/auth";
import { useClub } from "@/services/clubStore";
import { cancelMyPayOrder, subscribePayItems, subscribePayOrders } from "@/services/paymentService";
import { AnimatedPressable } from "@/ui/AnimatedPressable";
import { Button } from "@/ui/Button";
import { GradientCard } from "@/ui/GradientCard";
import { ProLock } from "@/ui/payments/ProLock";
import { StatusChip } from "@/ui/payments/StatusChip";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, radii, spacing, type } from "@/ui/theme";

/** Members: what the club takes payment for, and what you've paid. */
export default function PayScreen() {
  const router = useRouter();
  const club = useClub((s) => s.club);
  const role = useClub((s) => s.role);
  const members = useClub((s) => s.members);
  const uid = currentUser()?.uid ?? "";
  const me = members.find((m) => m.uid === uid);
  const isManager = canManagePayments(role, me);
  const clubId = club?.id;
  const pro = clubIsPro(club);

  const [items, setItems] = useState<PayItem[] | null>(null);
  const [mine, setMine] = useState<PayOrder[]>([]);
  const [allOrders, setAllOrders] = useState<PayOrder[]>([]);

  useEffect(() => {
    if (!clubId || !pro) return;
    return subscribePayItems(clubId, setItems, () => setItems([]));
  }, [clubId, pro]);
  useEffect(() => {
    if (!clubId || !uid || !pro) return;
    return subscribePayOrders(clubId, { uid }, setMine, () => setMine([]));
  }, [clubId, uid, pro]);
  useEffect(() => {
    if (!clubId || !isManager || !pro) return;
    return subscribePayOrders(clubId, { all: true }, setAllOrders, () => setAllOrders([]));
  }, [clubId, isManager, pro]);

  const visible = useMemo(() => sortPayItems((items ?? []).filter((i) => i.active)), [items]);
  const myOrders = useMemo(() => sortOrders(mine), [mine]);

  if (!club) return null;
  if (!pro) return <ProLock canUpgrade={role === "owner" || role === "admin"} />;

  const statusFor = (item: PayItem): "confirmed" | "pending" | null => {
    const o = mine.filter((x) => x.itemId === item.id && x.status !== "cancelled");
    if (o.some((x) => x.status === "confirmed")) return "confirmed";
    if (o.length) return "pending";
    return null;
  };

  const dues = visible.filter((i) => i.kind === "dues");
  const store = visible.filter((i) => i.kind !== "dues");
  const totals = orderTotals(allOrders);

  const onOrderPress = (o: PayOrder) => {
    if (o.status !== "pending") return;
    Alert.alert(o.itemTitle, "Withdraw this payment? Only do this if you didn't actually send it.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Withdraw",
        style: "destructive",
        onPress: () => {
          void cancelMyPayOrder(club.id, o.id).catch(() => Alert.alert("Couldn't withdraw", "Please try again."));
        },
      },
    ]);
  };

  const itemRow = (item: PayItem) => {
    const soldOut = isSoldOut(item);
    const left = !item.options?.length ? remainingStock(item) : null;
    const status = statusFor(item);
    return (
      <AnimatedPressable
        key={item.id}
        style={styles.row}
        onPress={() => router.push(`/club/pay/${item.id}` as never)}
      >
        <View style={styles.icon}>
          <Text style={styles.iconEmoji}>{PAY_ITEM_KIND_INFO[item.kind].emoji}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {formatMoney(item.priceCents)}
            {item.options?.length ? ` · ${item.options.join(" / ")}` : ""}
            {soldOut ? " · Sold out" : left !== null && left <= 5 ? ` · ${left} left` : ""}
          </Text>
        </View>
        {status && item.kind === "dues" ? (
          <StatusChip status={status} />
        ) : (
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        )}
      </AnimatedPressable>
    );
  };

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={styles.scroll}>
        {isManager && (
          <AnimatedPressable haptic onPress={() => router.push("/club/pay/manage" as never)}>
            <GradientCard padded style={styles.manageCard}>
              <View style={styles.manageRow}>
                <Text style={styles.manageEmoji}>🧮</Text>
                <View style={styles.flex}>
                  <Text style={styles.manageTitle}>Treasurer tools</Text>
                  <Text style={styles.manageMeta}>
                    {totals.pendingCount > 0
                      ? `${totals.pendingCount} to confirm · ${formatMoney(totals.pendingCents)}`
                      : "Items, payment options and who's paid"}
                  </Text>
                </View>
                {totals.pendingCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{totals.pendingCount}</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </View>
            </GradientCard>
          </AnimatedPressable>
        )}

        {items === null ? (
          <ActivityIndicator color={colors.ocean} style={{ marginTop: spacing.xl }} />
        ) : visible.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>💳</Text>
            <Text style={styles.emptyTitle}>Nothing to pay for yet</Text>
            <Text style={styles.emptyBody}>
              {isManager
                ? "Add your dues and merch, and how members can pay you (Zelle, Venmo, PayPal…). Members tap “I paid” and you confirm."
                : "When your club adds dues or merch, it'll show up here."}
            </Text>
            {isManager && (
              <Button
                title="✨ Set up payments"
                gradient="sunrise"
                onPress={() => router.push("/club/pay/manage" as never)}
                style={styles.emptyBtn}
              />
            )}
          </View>
        ) : (
          <>
            {dues.length > 0 && <Text style={styles.sectionLabel}>DUES</Text>}
            {dues.length > 0 && <GradientCard padded={false}>{dues.map(itemRow)}</GradientCard>}
            {store.length > 0 && <Text style={styles.sectionLabel}>STORE</Text>}
            {store.length > 0 && <GradientCard padded={false}>{store.map(itemRow)}</GradientCard>}
          </>
        )}

        {myOrders.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>MY PAYMENTS</Text>
            <GradientCard padded={false}>
              {myOrders.map((o) => (
                <AnimatedPressable key={o.id} style={styles.row} onPress={() => onOrderPress(o)}>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {o.itemTitle}
                      {o.option ? ` (${o.option})` : ""}
                      {o.qty > 1 ? ` ×${o.qty}` : ""}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {formatMoney(o.totalCents)} · {new Date(o.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <StatusChip status={o.status} />
                </AnimatedPressable>
              ))}
            </GradientCard>
            <Text style={styles.hint}>Pending until your treasurer sees the money arrive.</Text>
          </>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 120 },
  sectionLabel: {
    fontSize: type.size.xs,
    fontWeight: type.weight.heavy,
    color: colors.muted,
    letterSpacing: type.spacing.label,
    marginTop: spacing.md,
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
    backgroundColor: colors.bgSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  iconEmoji: { fontSize: 20 },
  rowTitle: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink },
  rowMeta: { fontSize: type.size.xs, color: colors.muted, marginTop: 2 },
  manageCard: { marginBottom: spacing.xs },
  manageRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  manageEmoji: { fontSize: 26 },
  manageTitle: { fontSize: type.size.md, fontWeight: type.weight.heavy, color: colors.ink },
  manageMeta: { fontSize: type.size.xs, color: colors.muted, marginTop: 2 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.coral,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { color: colors.white, fontSize: type.size.xs, fontWeight: type.weight.heavy },
  empty: { alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.md },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.ink, marginTop: spacing.sm },
  emptyBody: { fontSize: type.size.sm, color: colors.muted, textAlign: "center", lineHeight: 20, marginTop: spacing.xs },
  emptyBtn: { alignSelf: "stretch", marginTop: spacing.lg },
  hint: { fontSize: type.size.xs, color: colors.muted, marginLeft: spacing.xs },
});
