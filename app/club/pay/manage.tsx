import { Ionicons } from "@expo/vector-icons";
import { useMemo, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { clubIsPro } from "@/models/club";
import {
  canManagePayments,
  duesStatusByMember,
  formatMoney,
  NO_OPTION,
  ORDER_METHOD_CASH,
  orderTotals,
  PAY_ITEM_KIND_INFO,
  PAY_METHOD_INFO,
  payMethodName,
  remainingStock,
  sortOrders,
  sortPayItems,
  sortPayMethods,
  type DuesStatus,
  type PayItem,
  type PayMethod,
  type PayMethodKind,
  type PayOrder,
} from "@/models/payments";
import { currentUser } from "@/services/auth";
import { useClub } from "@/services/clubStore";
import {
  addPayItem,
  addPayMethod,
  createPayOrder,
  deletePayItem,
  deletePayMethod,
  deletePayOrder,
  setPayOrderStatus,
  subscribePayItems,
  subscribePayMethods,
  subscribePayOrders,
  updatePayItem,
  updatePayMethod,
  uploadPayQr,
} from "@/services/paymentService";
import { AnimatedPressable } from "@/ui/AnimatedPressable";
import { Button } from "@/ui/Button";
import { GradientCard } from "@/ui/GradientCard";
import { ItemEditor } from "@/ui/payments/ItemEditor";
import { MethodEditor } from "@/ui/payments/MethodEditor";
import { ProLock } from "@/ui/payments/ProLock";
import { RecordPayment } from "@/ui/payments/RecordPayment";
import { StatusChip } from "@/ui/payments/StatusChip";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, radii, spacing, type } from "@/ui/theme";

type Tab = "payments" | "items" | "methods";
type Filter = "pending" | "confirmed" | "all";

function methodLabel(method: string): string {
  if (method === ORDER_METHOD_CASH) return "Cash";
  return PAY_METHOD_INFO[method as PayMethodKind]?.name ?? method;
}

function csvCell(v: string | number | undefined): string {
  const s = v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Treasurer tools: confirm payments, track dues, manage items and payment options. */
export default function ManagePaymentsScreen() {
  const club = useClub((s) => s.club);
  const role = useClub((s) => s.role);
  const members = useClub((s) => s.members);
  const uid = currentUser()?.uid ?? "";
  const me = members.find((m) => m.uid === uid);
  const allowed = canManagePayments(role, me);
  const clubId = club?.id;
  const pro = clubIsPro(club);
  const live = !!clubId && pro && allowed;

  const [tab, setTab] = useState<Tab>("payments");
  const [filter, setFilter] = useState<Filter>("pending");
  const [items, setItems] = useState<PayItem[]>([]);
  const [methods, setMethods] = useState<PayMethod[]>([]);
  const [orders, setOrders] = useState<PayOrder[] | null>(null);
  const [itemEditor, setItemEditor] = useState<{ item: PayItem | null } | null>(null);
  const [methodEditor, setMethodEditor] = useState<{ method: PayMethod | null } | null>(null);
  const [recording, setRecording] = useState<{ uid?: string; itemId?: string } | null>(null);
  const [openDues, setOpenDues] = useState<string | null>(null);

  useEffect(() => {
    if (!live) return;
    return subscribePayItems(clubId!, setItems, () => setItems([]));
  }, [live, clubId]);
  useEffect(() => {
    if (!live) return;
    return subscribePayMethods(clubId!, (m) => setMethods(sortPayMethods(m)), () => setMethods([]));
  }, [live, clubId]);
  useEffect(() => {
    if (!live) return;
    return subscribePayOrders(clubId!, { all: true }, setOrders, () => setOrders([]));
  }, [live, clubId]);

  const sortedItems = useMemo(() => sortPayItems(items), [items]);
  const sortedOrders = useMemo(() => sortOrders(orders ?? []), [orders]);
  const totals = useMemo(() => orderTotals(orders ?? []), [orders]);
  const activeDues = sortedItems.filter((i) => i.kind === "dues" && i.active);

  if (!club) return null;
  if (!pro) return <ProLock canUpgrade={role === "owner" || role === "admin"} />;
  if (!allowed) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Only coaches, admins and the treasurer can manage payments.</Text>
      </View>
    );
  }

  const fail = (what: string) => (e: unknown) =>
    Alert.alert(`Couldn't ${what}`, e instanceof Error ? e.message : "Please try again.");

  // ── Orders ────────────────────────────────────────────────────────────────
  const confirm = (o: PayOrder) => void setPayOrderStatus(club.id, o.id, "confirmed", uid).catch(fail("confirm"));

  const orderActions = (o: PayOrder) => {
    const buttons: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = [];
    if (o.status !== "confirmed") buttons.push({ text: "✅ Confirm received", onPress: () => confirm(o) });
    if (o.status !== "pending")
      buttons.push({
        text: "Mark as pending",
        onPress: () => void setPayOrderStatus(club.id, o.id, "pending", uid).catch(fail("update")),
      });
    if (o.status !== "cancelled")
      buttons.push({
        text: "Cancel (not received)",
        onPress: () => void setPayOrderStatus(club.id, o.id, "cancelled", uid).catch(fail("cancel")),
      });
    buttons.push({
      text: "Delete",
      style: "destructive",
      onPress: () =>
        Alert.alert("Delete this record?", "It disappears from both your list and theirs.", [
          { text: "Keep", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => void deletePayOrder(club.id, o.id).catch(fail("delete")) },
        ]),
    });
    buttons.push({ text: "Close", style: "cancel" });
    const detail = [
      `${formatMoney(o.totalCents)} via ${methodLabel(o.method)}`,
      new Date(o.createdAt).toLocaleString(),
      o.recordedBy ? "Recorded by a treasurer" : "",
      o.note ? `“${o.note}”` : "",
    ]
      .filter(Boolean)
      .join("\n");
    Alert.alert(`${o.name} · ${o.itemTitle}${o.option ? ` (${o.option})` : ""}${o.qty > 1 ? ` ×${o.qty}` : ""}`, detail, buttons);
  };

  const exportCsv = () => {
    const rows = [
      ["Date", "Member", "Item", "Option", "Qty", "Total", "Method", "Status", "Note"],
      ...sortedOrders.map((o) => [
        o.createdAt.slice(0, 10),
        o.name,
        o.itemTitle,
        o.option ?? "",
        o.qty,
        (o.totalCents / 100).toFixed(2),
        methodLabel(o.method),
        o.status,
        o.note ?? "",
      ]),
    ];
    void Share.share({ message: rows.map((r) => r.map(csvCell).join(",")).join("\n"), title: `${club.name} payments` });
  };

  const shown = sortedOrders.filter((o) => filter === "all" || o.status === filter);

  const duesCard = (item: PayItem) => {
    const status = duesStatusByMember(item.id, members, orders ?? []);
    const count = (s: DuesStatus) => [...status.values()].filter((v) => v === s).length;
    const open = openDues === item.id;
    const byStatus = (s: DuesStatus) =>
      members.filter((m) => status.get(m.uid) === s).sort((a, b) => a.displayName.localeCompare(b.displayName));
    return (
      <GradientCard key={item.id} padded>
        <Pressable onPress={() => setOpenDues(open ? null : item.id)} style={styles.duesHead}>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>🪪 {item.title}</Text>
            <Text style={styles.cardMeta}>
              {count("paid")} paid · {count("pending")} pending · {count("unpaid")} unpaid
            </Text>
          </View>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
        </Pressable>
        <View style={styles.bar}>
          <View style={[styles.barPaid, { flex: count("paid") }]} />
          <View style={[styles.barPending, { flex: count("pending") }]} />
          <View style={[styles.barUnpaid, { flex: count("unpaid") }]} />
        </View>
        {open &&
          (["unpaid", "pending", "paid"] as DuesStatus[]).map((s) =>
            byStatus(s).map((m) => (
              <View key={`${s}-${m.uid}`} style={styles.duesRow}>
                <Text style={styles.duesName} numberOfLines={1}>{m.displayName}</Text>
                {s === "unpaid" ? (
                  <Pressable
                    hitSlop={6}
                    style={styles.markPaid}
                    onPress={() => setRecording({ uid: m.uid, itemId: item.id })}
                  >
                    <Text style={styles.markPaidText}>Mark paid</Text>
                  </Pressable>
                ) : (
                  <StatusChip status={s === "paid" ? "confirmed" : "pending"} />
                )}
              </View>
            )),
          )}
      </GradientCard>
    );
  };

  const paymentsTab = (
    <>
      <View style={styles.totals}>
        <View style={styles.totalBox}>
          <Text style={styles.totalNum}>{formatMoney(totals.confirmedCents)}</Text>
          <Text style={styles.totalLabel}>received</Text>
        </View>
        <View style={styles.totalBox}>
          <Text style={[styles.totalNum, totals.pendingCount > 0 && { color: colors.sunset }]}>
            {formatMoney(totals.pendingCents)}
          </Text>
          <Text style={styles.totalLabel}>
            {totals.pendingCount} to confirm
          </Text>
        </View>
      </View>

      {activeDues.map(duesCard)}

      <View style={styles.actionsRow}>
        <Button title="+ Record a payment" variant="outline" onPress={() => setRecording({})} style={styles.flex} />
        {sortedOrders.length > 0 && (
          <Pressable onPress={exportCsv} hitSlop={8} style={styles.exportBtn}>
            <Ionicons name="share-outline" size={18} color={colors.ocean} />
            <Text style={styles.exportText}>Export</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.filters}>
        {(
          [
            ["pending", `To confirm${totals.pendingCount ? ` (${totals.pendingCount})` : ""}`],
            ["confirmed", "Confirmed"],
            ["all", "All"],
          ] as [Filter, string][]
        ).map(([f, label]) => (
          <Pressable key={f} onPress={() => setFilter(f)} style={[styles.filter, filter === f && styles.filterOn]}>
            <Text style={[styles.filterText, filter === f && styles.filterTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {orders === null ? (
        <ActivityIndicator color={colors.ocean} />
      ) : shown.length === 0 ? (
        <Text style={styles.emptyLine}>
          {filter === "pending" ? "Nothing waiting. Shoots! 🤙" : "No payments yet."}
        </Text>
      ) : (
        <GradientCard padded={false}>
          {shown.map((o) => (
            <AnimatedPressable key={o.id} style={styles.row} onPress={() => orderActions(o)}>
              <View style={styles.flex}>
                <Text style={styles.rowTitle} numberOfLines={1}>{o.name}</Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {o.itemTitle}
                  {o.option ? ` (${o.option})` : ""}
                  {o.qty > 1 ? ` ×${o.qty}` : ""} · {methodLabel(o.method)} ·{" "}
                  {new Date(o.createdAt).toLocaleDateString()}
                </Text>
                {!!o.note && <Text style={styles.rowNote} numberOfLines={2}>“{o.note}”</Text>}
              </View>
              <Text style={styles.amount}>{formatMoney(o.totalCents)}</Text>
              {o.status === "pending" ? (
                <Pressable hitSlop={8} onPress={() => confirm(o)} style={styles.confirmBtn}>
                  <Ionicons name="checkmark" size={18} color={colors.white} />
                </Pressable>
              ) : (
                <StatusChip status={o.status} />
              )}
            </AnimatedPressable>
          ))}
        </GradientCard>
      )}
      {filter === "pending" && shown.length > 0 && (
        <Text style={styles.hint}>Tap ✓ once the money shows up in your account. Tap a row for more.</Text>
      )}
    </>
  );

  const stockSummary = (item: PayItem): string | null => {
    if (!item.stock) return null;
    const keys = item.options?.length ? item.options : [NO_OPTION];
    return keys
      .map((k) => {
        const left = remainingStock(item, k === NO_OPTION ? undefined : k) ?? 0;
        return k === NO_OPTION ? `${left} left` : `${k} ${left}`;
      })
      .join(" · ");
  };

  const itemsTab = (
    <>
      <Button title="+ Add item" gradient="sunrise" onPress={() => setItemEditor({ item: null })} />
      {sortedItems.length === 0 ? (
        <Text style={styles.emptyLine}>Add your dues, shirts, hats, race entries…</Text>
      ) : (
        <GradientCard padded={false}>
          {sortedItems.map((item) => {
            const stock = stockSummary(item);
            const sold = Object.values(item.sold ?? {}).reduce((a, b) => a + b, 0);
            return (
              <AnimatedPressable key={item.id} style={styles.row} onPress={() => setItemEditor({ item })}>
                <Text style={styles.rowEmoji}>{PAY_ITEM_KIND_INFO[item.kind].emoji}</Text>
                <View style={styles.flex}>
                  <Text style={[styles.rowTitle, !item.active && styles.inactive]} numberOfLines={1}>
                    {item.title}
                    {!item.active ? " (hidden)" : ""}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={2}>
                    {formatMoney(item.priceCents)}
                    {sold > 0 ? ` · ${sold} ordered` : ""}
                    {stock ? `\nStock: ${stock}` : ""}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </AnimatedPressable>
            );
          })}
        </GradientCard>
      )}
    </>
  );

  const methodsTab = (
    <>
      <Button title="+ Add payment option" gradient="sunrise" onPress={() => setMethodEditor({ method: null })} />
      {methods.length === 0 ? (
        <Text style={styles.emptyLine}>Add how members pay you, e.g. your Zelle email and QR code.</Text>
      ) : (
        <GradientCard padded={false}>
          {methods.map((m) => (
            <AnimatedPressable key={m.id} style={styles.row} onPress={() => setMethodEditor({ method: m })}>
              <Text style={styles.rowEmoji}>{PAY_METHOD_INFO[m.kind].emoji}</Text>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{payMethodName(m)}</Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {m.handle || m.url || m.instructions || ""}
                  {m.qrUrl ? " · QR code" : ""}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </AnimatedPressable>
          ))}
        </GradientCard>
      )}
      <Text style={styles.hint}>Members see these in this order when they pay.</Text>
    </>
  );

  return (
    <ScreenBackground>
      <View style={styles.tabs}>
        {(
          [
            ["payments", "Payments"],
            ["items", "Items"],
            ["methods", "Ways to pay"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabOn]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>
              {label}
              {t === "payments" && totals.pendingCount > 0 ? ` · ${totals.pendingCount}` : ""}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {tab === "payments" ? paymentsTab : tab === "items" ? itemsTab : methodsTab}
      </ScrollView>

      <ItemEditor
        visible={!!itemEditor}
        item={itemEditor?.item ?? null}
        onClose={() => setItemEditor(null)}
        onSave={async (draft) => {
          const existing = itemEditor?.item;
          if (existing) await updatePayItem(club.id, existing.id, draft);
          else await addPayItem(club.id, uid, draft, items.length);
        }}
        onDelete={() => {
          const existing = itemEditor?.item;
          if (!existing) return;
          Alert.alert(`Delete “${existing.title}”?`, "Payments already recorded for it are kept. To just hide it from members, turn off “Show to members” instead.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: () => {
                setItemEditor(null);
                void deletePayItem(club.id, existing.id).catch(fail("delete"));
              },
            },
          ]);
        }}
      />

      <MethodEditor
        visible={!!methodEditor}
        method={methodEditor?.method ?? null}
        onClose={() => setMethodEditor(null)}
        onUploadQr={(uri, mime) => uploadPayQr(club.id, uri, mime)}
        onSave={async (draft) => {
          const existing = methodEditor?.method;
          if (existing) await updatePayMethod(club.id, existing.id, draft);
          else await addPayMethod(club.id, draft, methods.length);
        }}
        onDelete={() => {
          const existing = methodEditor?.method;
          if (!existing) return;
          setMethodEditor(null);
          void deletePayMethod(club.id, existing.id).catch(fail("remove"));
        }}
      />

      <RecordPayment
        visible={!!recording}
        members={members}
        items={sortedItems}
        preset={recording ?? undefined}
        onClose={() => setRecording(null)}
        onSave={async (p) => {
          await createPayOrder(club.id, {
            uid: p.member.uid,
            name: p.member.displayName,
            item: p.item,
            option: p.option,
            qty: p.qty,
            method: p.method,
            note: p.note,
            recordedBy: uid,
            status: "confirmed",
          });
        }}
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: colors.bgSoft },
  muted: { fontSize: type.size.sm, color: colors.muted, textAlign: "center" },
  tabs: {
    flexDirection: "row",
    margin: spacing.lg,
    marginBottom: 0,
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: radii.pill, alignItems: "center" },
  tabOn: { backgroundColor: colors.ocean },
  tabText: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.inkSoft },
  tabTextOn: { color: colors.white },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 120 },
  totals: { flexDirection: "row", gap: spacing.md },
  totalBox: { flex: 1, backgroundColor: colors.white, borderRadius: radii.lg, padding: spacing.md },
  totalNum: { fontSize: type.size.xl, fontWeight: type.weight.heavy, color: colors.ink, ...type.mono },
  totalLabel: { fontSize: type.size.xs, color: colors.muted, marginTop: 2 },
  cardTitle: { fontSize: type.size.md, fontWeight: type.weight.heavy, color: colors.ink },
  cardMeta: { fontSize: type.size.xs, color: colors.muted, marginTop: 2 },
  duesHead: { flexDirection: "row", alignItems: "center" },
  bar: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: colors.line, marginTop: spacing.sm },
  barPaid: { backgroundColor: colors.success },
  barPending: { backgroundColor: colors.mango },
  barUnpaid: { backgroundColor: colors.line },
  duesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  duesName: { flex: 1, fontSize: type.size.sm, color: colors.ink, marginRight: spacing.sm },
  markPaid: { borderWidth: 1.5, borderColor: colors.ocean, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  markPaidText: { fontSize: type.size.xs, fontWeight: type.weight.bold, color: colors.ocean },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  exportBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  exportText: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.ocean },
  filters: { flexDirection: "row", gap: spacing.sm },
  filter: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  filterOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterText: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.inkSoft },
  filterTextOn: { color: colors.white },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowEmoji: { fontSize: 22 },
  rowTitle: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink },
  rowMeta: { fontSize: type.size.xs, color: colors.muted, marginTop: 2, lineHeight: 16 },
  rowNote: { fontSize: type.size.xs, color: colors.inkSoft, marginTop: 2, fontStyle: "italic" },
  inactive: { color: colors.muted },
  amount: { fontSize: type.size.md, fontWeight: type.weight.heavy, color: colors.ink, ...type.mono },
  confirmBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyLine: { fontSize: type.size.sm, color: colors.muted, textAlign: "center", marginVertical: spacing.lg },
  hint: { fontSize: type.size.xs, color: colors.muted, marginLeft: spacing.xs },
});
