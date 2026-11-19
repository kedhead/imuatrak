import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import type { ClubMember } from "@/models/club";
import {
  formatMoney,
  ORDER_METHOD_CASH,
  PAY_METHOD_INFO,
  PAY_QTY_MAX,
  type PayItem,
  type PayMethodKind,
} from "@/models/payments";
import { Button } from "../Button";
import { colors, spacing, type } from "../theme";
import { editorStyles } from "./ItemEditor";

export interface RecordedPayment {
  member: ClubMember;
  item: PayItem;
  option?: string;
  qty: number;
  method: string;
  note?: string;
}

const METHODS: { id: string; label: string }[] = [
  { id: ORDER_METHOD_CASH, label: "💵 Cash" },
  ...(["zelle", "venmo", "paypal", "cashapp", "other"] as PayMethodKind[]).map((k) => ({
    id: k,
    label: `${PAY_METHOD_INFO[k].emoji} ${k === "other" ? "Check / other" : PAY_METHOD_INFO[k].name}`,
  })),
];

/**
 * Treasurer: record a payment someone made outside the app (cash at
 * practice, a Zelle that arrived before they tapped "I paid"). It's saved as
 * confirmed, and counts toward stock like any other order.
 */
export function RecordPayment({
  visible,
  members,
  items,
  preset,
  onSave,
  onClose,
}: {
  visible: boolean;
  members: ClubMember[];
  items: PayItem[];
  preset?: { uid?: string; itemId?: string };
  onSave: (p: RecordedPayment) => Promise<void>;
  onClose: () => void;
}) {
  const [uid, setUid] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [itemId, setItemId] = useState<string | null>(null);
  const [option, setOption] = useState<string | undefined>();
  const [qty, setQty] = useState(1);
  const [method, setMethod] = useState(ORDER_METHOD_CASH);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setUid(preset?.uid ?? null);
    setItemId(preset?.itemId ?? null);
    setSearch("");
    setOption(undefined);
    setQty(1);
    setMethod(ORDER_METHOD_CASH);
    setNote("");
  }, [visible, preset?.uid, preset?.itemId]);

  const member = members.find((m) => m.uid === uid);
  const item = items.find((i) => i.id === itemId);
  const sortedMembers = useMemo(
    () =>
      [...members]
        .filter((m) => !search.trim() || m.displayName.toLowerCase().includes(search.trim().toLowerCase()))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [members, search],
  );

  const save = async () => {
    if (!member) return Alert.alert("Who paid?", "Pick the member.");
    if (!item) return Alert.alert("For what?", "Pick the item.");
    if (item.options?.length && !option) return Alert.alert("Size", "Pick a size/option.");
    setSaving(true);
    try {
      await onSave({ member, item, option, qty: item.kind === "dues" ? 1 : qty, method, note });
      onClose();
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.headTitle}>Record a payment</Text>
          <Pressable onPress={save} hitSlop={10} disabled={saving}>
            <Text style={[styles.save, saving && { opacity: 0.4 }]}>Save</Text>
          </Pressable>
        </View>
        <KeyboardAwareScrollView contentContainerStyle={styles.body} bottomOffset={24} keyboardShouldPersistTaps="handled">
          <Text style={styles.help}>For cash at practice, or money that arrived before they tapped “I paid”. Saved as confirmed.</Text>

          <Text style={styles.label}>Member</Text>
          {member ? (
            <Pressable style={styles.picked} onPress={() => setUid(null)}>
              <Text style={styles.pickedText}>{member.displayName}</Text>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={search}
                onChangeText={setSearch}
                placeholder="Search members"
                placeholderTextColor={colors.muted}
              />
              <View style={styles.memberList}>
                {sortedMembers.slice(0, 30).map((m) => (
                  <Pressable key={m.uid} style={styles.memberRow} onPress={() => setUid(m.uid)}>
                    <Text style={styles.memberName}>{m.displayName}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text style={styles.label}>For</Text>
          <View style={styles.row}>
            {items.map((i) => (
              <Pressable
                key={i.id}
                onPress={() => {
                  setItemId(i.id);
                  setOption(undefined);
                }}
                style={[styles.pill, itemId === i.id && styles.pillOn]}
              >
                <Text style={[styles.pillText, itemId === i.id && styles.pillTextOn]}>
                  {i.title} · {formatMoney(i.priceCents)}
                </Text>
              </Pressable>
            ))}
          </View>

          {!!item?.options?.length && (
            <>
              <Text style={styles.label}>Size / option</Text>
              <View style={styles.row}>
                {item.options.map((o) => (
                  <Pressable key={o} onPress={() => setOption(o)} style={[styles.pill, option === o && styles.pillOn]}>
                    <Text style={[styles.pillText, option === o && styles.pillTextOn]}>{o}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {item && item.kind !== "dues" && (
            <View style={styles.qtyRow}>
              <Text style={styles.label}>Quantity</Text>
              <View style={styles.stepper}>
                <Pressable hitSlop={8} onPress={() => setQty((q) => Math.max(1, q - 1))}>
                  <Ionicons name="remove-circle-outline" size={26} color={colors.ocean} />
                </Pressable>
                <Text style={styles.qty}>{qty}</Text>
                <Pressable hitSlop={8} onPress={() => setQty((q) => Math.min(PAY_QTY_MAX, q + 1))}>
                  <Ionicons name="add-circle-outline" size={26} color={colors.ocean} />
                </Pressable>
              </View>
            </View>
          )}

          <Text style={styles.label}>Paid with</Text>
          <View style={styles.row}>
            {METHODS.map((m) => (
              <Pressable key={m.id} onPress={() => setMethod(m.id)} style={[styles.pill, method === m.id && styles.pillOn]}>
                <Text style={[styles.pillText, method === m.id && styles.pillTextOn]}>{m.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Note (optional)</Text>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={(v) => setNote(v.slice(0, 120))}
            placeholder="e.g. check #1043"
            placeholderTextColor={colors.muted}
          />

          {item && (
            <Text style={styles.total}>
              Total {formatMoney(item.priceCents * (item.kind === "dues" ? 1 : qty))}
            </Text>
          )}
          <Button title={saving ? "Saving…" : "Save as paid"} gradient="aqua" onPress={save} disabled={saving} style={styles.saveBtn} />
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  ...editorStyles,
  picked: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.ocean,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  pickedText: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink },
  memberList: { backgroundColor: colors.white, borderRadius: 12, marginTop: spacing.xs, maxHeight: 260, overflow: "hidden" },
  memberRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  memberName: { fontSize: type.size.md, color: colors.ink },
  qtyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md },
  qty: { fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.ink, minWidth: 24, textAlign: "center" },
  total: { fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.ink, marginTop: spacing.lg, textAlign: "right" },
});
