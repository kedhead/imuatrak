import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { clubIsPro } from "@/models/club";
import {
  formatMoney,
  PAY_ITEM_KIND_INFO,
  PAY_METHOD_INFO,
  PAY_NOTE_MAX,
  PAY_QTY_MAX,
  payLink,
  payMethodName,
  paymentMemo,
  remainingStock,
  sortPayMethods,
  type PayItem,
  type PayMethod,
  type PayOrder,
} from "@/models/payments";
import { currentUser } from "@/services/auth";
import { useClub } from "@/services/clubStore";
import {
  createPayOrder,
  subscribePayItems,
  subscribePayMethods,
  subscribePayOrders,
} from "@/services/paymentService";
import { AnimatedPressable } from "@/ui/AnimatedPressable";
import { Button } from "@/ui/Button";
import { GradientCard } from "@/ui/GradientCard";
import { ProLock } from "@/ui/payments/ProLock";
import { StatusChip } from "@/ui/payments/StatusChip";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, radii, spacing, type } from "@/ui/theme";

/** Pay for one item: pick size and quantity, pay the club your usual way,
 *  then tap "I paid" for the treasurer to confirm. */
export default function PayItemScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const router = useRouter();
  const club = useClub((s) => s.club);
  const role = useClub((s) => s.role);
  const members = useClub((s) => s.members);
  const user = currentUser();
  const uid = user?.uid ?? "";
  const myName = members.find((m) => m.uid === uid)?.displayName || user?.displayName || "Member";
  const clubId = club?.id;
  const pro = clubIsPro(club);

  const [items, setItems] = useState<PayItem[] | null>(null);
  const [methods, setMethods] = useState<PayMethod[]>([]);
  const [mine, setMine] = useState<PayOrder[]>([]);
  const [pickedOption, setOption] = useState<string | undefined>();
  const [pickedQty, setQty] = useState(1);
  const [methodId, setMethodId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [qrOpen, setQrOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!clubId || !pro) return;
    return subscribePayItems(clubId, setItems, () => setItems([]));
  }, [clubId, pro]);
  useEffect(() => {
    if (!clubId || !pro) return;
    return subscribePayMethods(clubId, (m) => setMethods(sortPayMethods(m)), () => setMethods([]));
  }, [clubId, pro]);
  useEffect(() => {
    if (!clubId || !uid || !pro) return;
    return subscribePayOrders(clubId, { uid }, setMine, () => setMine([]));
  }, [clubId, uid, pro]);

  const item = items?.find((i) => i.id === itemId);
  const method = methods.find((m) => m.id === methodId) ?? methods[0];

  // Until they pick, the first size that's still in stock.
  const option = item?.options?.length
    ? pickedOption && item.options.includes(pickedOption)
      ? pickedOption
      : (item.options.find((o) => remainingStock(item, o) !== 0) ?? item.options[0])
    : undefined;

  const left = item ? remainingStock(item, option) : null;
  const maxQty = item?.kind === "dues" ? 1 : Math.max(1, Math.min(PAY_QTY_MAX, left ?? PAY_QTY_MAX));
  const qty = Math.min(pickedQty, maxQty);

  const total = (item?.priceCents ?? 0) * qty;
  const memo = useMemo(
    () => (item ? paymentMemo(item.title, myName, option, qty) : ""),
    [item, myName, option, qty],
  );
  const myForItem = mine.filter((o) => o.itemId === itemId && o.status !== "cancelled");

  if (!club) return null;
  if (!pro) return <ProLock canUpgrade={role === "owner" || role === "admin"} />;
  if (items === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ocean} />
      </View>
    );
  }
  if (!item || !item.active) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>This item isn't available any more.</Text>
      </View>
    );
  }

  const soldOut = left === 0;

  const copy = async (text: string, what: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied", `${what} copied. Paste it into your payment app.`);
  };

  const shareQr = async (url: string) => {
    try {
      const target = `${FileSystem.cacheDirectory}imuatrak-pay-qr.jpg`;
      const { uri } = await FileSystem.downloadAsync(url, target);
      await Sharing.shareAsync(uri, { mimeType: "image/jpeg", UTI: "public.jpeg" });
    } catch {
      Alert.alert("Couldn't share", "Please try again.");
    }
  };

  const open = async (m: PayMethod) => {
    const link = payLink(m, total, memo);
    if (!link) return;
    try {
      await Linking.openURL(link);
    } catch {
      Alert.alert("Couldn't open", `Open ${payMethodName(m)} yourself and send ${formatMoney(total)}.`);
    }
  };

  const submit = () => {
    const methodLabel = method ? payMethodName(method) : "your usual way";
    Alert.alert(
      `Sent ${formatMoney(total)}?`,
      `Only tap this once you've paid via ${methodLabel}. Your treasurer will confirm when it arrives.`,
      [
        { text: "Not yet", style: "cancel" },
        {
          text: "I paid",
          onPress: async () => {
            setSaving(true);
            try {
              await createPayOrder(club.id, {
                uid,
                name: myName,
                item,
                option,
                qty,
                method: method?.kind ?? "other",
                note,
              });
              Alert.alert("Mahalo! 🤙", "Your treasurer has been told. You'll get a notification when it's confirmed.");
              router.back();
            } catch (e) {
              Alert.alert("Couldn't save", e instanceof Error ? e.message : "Please try again.");
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  return (
    <ScreenBackground>
      <KeyboardAwareScrollView contentContainerStyle={styles.scroll} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <GradientCard padded>
          <Text style={styles.kind}>
            {PAY_ITEM_KIND_INFO[item.kind].emoji} {PAY_ITEM_KIND_INFO[item.kind].name.toUpperCase()}
          </Text>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.price}>{formatMoney(item.priceCents)}{item.kind !== "dues" ? " each" : ""}</Text>
          {!!item.description && <Text style={styles.desc}>{item.description}</Text>}
          {myForItem.length > 0 && (
            <View style={styles.already}>
              <StatusChip status={myForItem.some((o) => o.status === "confirmed") ? "confirmed" : "pending"} />
              <Text style={styles.alreadyText}>
                {item.kind === "dues" ? "You've already paid this." : `You've ordered this ${myForItem.length}×.`}
              </Text>
            </View>
          )}

          {!!item.options?.length && (
            <>
              <Text style={styles.label}>Size / option</Text>
              <View style={styles.chips}>
                {item.options.map((o) => {
                  const l = remainingStock(item, o);
                  const out = l === 0;
                  const on = o === option;
                  return (
                    <Pressable
                      key={o}
                      disabled={out}
                      onPress={() => setOption(o)}
                      style={[styles.chip, on && styles.chipOn, out && styles.chipOut]}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn, out && styles.chipTextOut]}>
                        {o}
                      </Text>
                      {l !== null && l <= 5 && !out && <Text style={[styles.chipLeft, on && styles.chipTextOn]}>{l} left</Text>}
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {item.kind !== "dues" && !soldOut && (
            <View style={styles.qtyRow}>
              <Text style={styles.label}>Quantity</Text>
              <View style={styles.stepper}>
                <Pressable hitSlop={8} onPress={() => setQty(Math.max(1, qty - 1))} style={styles.stepBtn}>
                  <Ionicons name="remove" size={18} color={qty > 1 ? colors.ocean : colors.line} />
                </Pressable>
                <Text style={styles.qty}>{qty}</Text>
                <Pressable hitSlop={8} onPress={() => setQty(Math.min(maxQty, qty + 1))} style={styles.stepBtn}>
                  <Ionicons name="add" size={18} color={qty < maxQty ? colors.ocean : colors.line} />
                </Pressable>
              </View>
            </View>
          )}
          {left !== null && !soldOut && left <= 5 && !item.options?.length && (
            <Text style={styles.leftText}>Only {left} left</Text>
          )}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.total}>{soldOut ? "Sold out" : formatMoney(total)}</Text>
          </View>
        </GradientCard>

        {!soldOut && (
          <>
            <Text style={styles.section}>1 · PAY THE CLUB</Text>
            {methods.length === 0 ? (
              <GradientCard padded>
                <Text style={styles.muted}>
                  Your club hasn't added payment options yet. Ask your treasurer how to pay, then come back and tap “I paid”.
                </Text>
              </GradientCard>
            ) : (
              methods.map((m) => {
                const on = method?.id === m.id;
                const link = payLink(m, total, memo);
                return (
                  <AnimatedPressable key={m.id} onPress={() => setMethodId(m.id)}>
                    <GradientCard padded style={[styles.method, on && styles.methodOn]}>
                      <View style={styles.methodHead}>
                        <Text style={styles.methodEmoji}>{PAY_METHOD_INFO[m.kind].emoji}</Text>
                        <Text style={styles.methodName}>{payMethodName(m)}</Text>
                        <Ionicons
                          name={on ? "radio-button-on" : "radio-button-off"}
                          size={20}
                          color={on ? colors.ocean : colors.muted}
                          style={styles.radio}
                        />
                      </View>
                      {!!m.handle && (
                        <Pressable style={styles.handleRow} onPress={() => copy(m.handle!, PAY_METHOD_INFO[m.kind].handleLabel ?? "Details")}>
                          <Text style={styles.handle} selectable>{m.handle}</Text>
                          <Ionicons name="copy-outline" size={16} color={colors.ocean} />
                        </Pressable>
                      )}
                      {!!m.instructions && <Text style={styles.instructions}>{m.instructions}</Text>}
                      {!!m.qrUrl && (
                        <Pressable onPress={() => setQrOpen(m.qrUrl!)} style={styles.qrThumbWrap}>
                          <Image source={{ uri: m.qrUrl }} style={styles.qrThumb} contentFit="contain" />
                          <Text style={styles.qrHint}>Tap to enlarge or save the QR code</Text>
                        </Pressable>
                      )}
                      {on && link && (
                        <Button
                          title={m.kind === "link" ? "Open store" : `Open ${payMethodName(m)} · ${formatMoney(total)}`}
                          variant="primary"
                          onPress={() => open(m)}
                          style={styles.openBtn}
                        />
                      )}
                      {on && m.kind === "zelle" && (
                        <Text style={styles.zelleTip}>
                          In your bank app, choose Zelle → send {formatMoney(total)} to the email/phone above
                          {m.qrUrl ? ", or scan the QR from another phone" : ""}.
                        </Text>
                      )}
                    </GradientCard>
                  </AnimatedPressable>
                );
              })
            )}

            <Pressable style={styles.memo} onPress={() => copy(memo, "Memo")}>
              <View style={styles.flex}>
                <Text style={styles.memoLabel}>Put this in the memo / note</Text>
                <Text style={styles.memoText} selectable>{memo}</Text>
              </View>
              <Ionicons name="copy-outline" size={18} color={colors.ocean} />
            </Pressable>

            <Text style={styles.section}>2 · TELL YOUR TREASURER</Text>
            <TextInput
              style={styles.note}
              placeholder="Note (optional), e.g. sent from Mom's account"
              placeholderTextColor={colors.muted}
              value={note}
              onChangeText={(t) => setNote(t.slice(0, PAY_NOTE_MAX))}
              multiline
            />
            <Button
              title={saving ? "Saving…" : `✅ I paid ${formatMoney(total)}`}
              gradient="aqua"
              glow
              disabled={saving}
              onPress={submit}
            />
          </>
        )}
      </KeyboardAwareScrollView>

      <Modal visible={!!qrOpen} transparent animationType="fade" onRequestClose={() => setQrOpen(null)}>
        <Pressable style={styles.qrOverlay} onPress={() => setQrOpen(null)}>
          <View style={styles.qrCard}>
            {qrOpen && <Image source={{ uri: qrOpen }} style={styles.qrBig} contentFit="contain" />}
            <Button title="Save or share" variant="outline" onPress={() => qrOpen && shareQr(qrOpen)} />
          </View>
        </Pressable>
      </Modal>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: colors.bgSoft },
  muted: { fontSize: type.size.sm, color: colors.muted, lineHeight: 20 },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 80 },
  kind: { fontSize: type.size.xs, fontWeight: type.weight.heavy, color: colors.muted, letterSpacing: type.spacing.label },
  title: { fontSize: type.size.xxl, fontWeight: type.weight.heavy, color: colors.ink, marginTop: 2 },
  price: { fontSize: type.size.lg, fontWeight: type.weight.bold, color: colors.ocean, marginTop: 2 },
  desc: { fontSize: type.size.sm, color: colors.inkSoft, marginTop: spacing.sm, lineHeight: 20 },
  already: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  alreadyText: { fontSize: type.size.sm, color: colors.muted },
  label: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.ink, marginTop: spacing.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    minWidth: 48,
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  chipOn: { borderColor: colors.ocean, backgroundColor: colors.ocean },
  chipOut: { opacity: 0.4 },
  chipText: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink },
  chipTextOn: { color: colors.white },
  chipTextOut: { textDecorationLine: "line-through" },
  chipLeft: { fontSize: 10, color: colors.coral, fontWeight: type.weight.bold },
  qtyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  qty: { fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.ink, minWidth: 24, textAlign: "center" },
  leftText: { fontSize: type.size.xs, color: colors.coral, fontWeight: type.weight.bold, marginTop: spacing.xs },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  totalLabel: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink },
  total: { fontSize: type.size.xl, fontWeight: type.weight.heavy, color: colors.ink },
  section: {
    fontSize: type.size.xs,
    fontWeight: type.weight.heavy,
    color: colors.muted,
    letterSpacing: type.spacing.label,
    marginTop: spacing.md,
    marginLeft: spacing.xs,
  },
  method: { borderWidth: 2, borderColor: "transparent" },
  methodOn: { borderColor: colors.ocean },
  methodHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  methodEmoji: { fontSize: 22 },
  methodName: { fontSize: type.size.md, fontWeight: type.weight.heavy, color: colors.ink },
  radio: { marginLeft: "auto" },
  handleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    backgroundColor: colors.bgSoft,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  handle: { flex: 1, fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ocean },
  instructions: { fontSize: type.size.sm, color: colors.inkSoft, marginTop: spacing.sm, lineHeight: 20 },
  qrThumbWrap: { alignItems: "center", marginTop: spacing.sm, gap: spacing.xs },
  qrThumb: { width: 140, height: 140, borderRadius: radii.md, backgroundColor: colors.white },
  qrHint: { fontSize: type.size.xs, color: colors.muted },
  openBtn: { marginTop: spacing.md },
  zelleTip: { fontSize: type.size.xs, color: colors.muted, marginTop: spacing.sm, lineHeight: 18 },
  memo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.sandLight,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  memoLabel: { fontSize: type.size.xs, color: colors.muted, fontWeight: type.weight.bold },
  memoText: { fontSize: type.size.md, color: colors.ink, fontWeight: type.weight.bold, marginTop: 2 },
  note: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 60,
    fontSize: type.size.md,
    color: colors.ink,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: colors.line,
  },
  qrOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  qrCard: { backgroundColor: colors.white, borderRadius: radii.xl, padding: spacing.lg, gap: spacing.md, alignSelf: "stretch" },
  qrBig: { width: "100%", aspectRatio: 1 },
});
