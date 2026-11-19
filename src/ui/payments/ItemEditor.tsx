import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import {
  formatMoney,
  NO_OPTION,
  parseMoney,
  PAY_DESC_MAX,
  PAY_ITEM_KIND_INFO,
  PAY_OPTION_MAX,
  PAY_OPTIONS_MAX,
  PAY_STOCK_MAX,
  PAY_TITLE_MAX,
  type PayItem,
  type PayItemKind,
} from "@/models/payments";
import type { PayItemDraft } from "@/services/paymentService";
import { Button } from "../Button";
import { colors, radii, spacing, type } from "../theme";

const KINDS: PayItemKind[] = ["dues", "merch", "other"];

/** Quick-start items a treasurer can tap instead of typing. */
const PRESETS: { label: string; draft: Partial<PayItemDraft> & { priceText: string; optionsText?: string } }[] = [
  { label: "🪪 Season dues", draft: { title: `${new Date().getFullYear() + 1} Season Dues`, kind: "dues", priceText: "" } },
  { label: "👕 T-shirt", draft: { title: "Club T-shirt", kind: "merch", priceText: "25", optionsText: "S, M, L, XL, 2XL" } },
  { label: "🧢 Hat", draft: { title: "Club hat", kind: "merch", priceText: "20" } },
  { label: "🏁 Race entry", draft: { title: "Regatta entry", kind: "other", priceText: "" } },
];

function parseOptions(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const o = raw.trim().slice(0, PAY_OPTION_MAX);
    // "." and "/" would be fine in Firestore keys via FieldPath, but "_" is
    // our no-option key; keep it out of real option names.
    if (!o || o === NO_OPTION || seen.has(o.toLowerCase())) continue;
    seen.add(o.toLowerCase());
    out.push(o);
  }
  return out.slice(0, PAY_OPTIONS_MAX);
}

export function ItemEditor({
  visible,
  item,
  onSave,
  onDelete,
  onClose,
}: {
  visible: boolean;
  /** null: a new item. */
  item: PayItem | null;
  onSave: (draft: PayItemDraft) => Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<PayItemKind>("merch");
  const [priceText, setPriceText] = useState("");
  const [description, setDescription] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [trackStock, setTrackStock] = useState(false);
  const [stockText, setStockText] = useState<Record<string, string>>({});
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(item?.title ?? "");
    setKind(item?.kind ?? "merch");
    setPriceText(item ? String(item.priceCents / 100) : "");
    setDescription(item?.description ?? "");
    setOptionsText(item?.options?.join(", ") ?? "");
    setTrackStock(!!item?.stock);
    setStockText(Object.fromEntries(Object.entries(item?.stock ?? {}).map(([k, v]) => [k, String(v)])));
    setActive(item?.active ?? true);
  }, [visible, item]);

  const options = kind === "dues" ? [] : parseOptions(optionsText);
  const stockKeys = options.length ? options : [NO_OPTION];
  const soldFor = (k: string) => item?.sold?.[k] ?? 0;

  const applyPreset = (p: (typeof PRESETS)[number]["draft"]) => {
    setTitle(p.title ?? "");
    setKind(p.kind ?? "merch");
    setPriceText(p.priceText);
    setOptionsText(p.optionsText ?? "");
  };

  const save = async () => {
    const t = title.trim();
    if (!t) return Alert.alert("Name it", "Give the item a name, e.g. “2027 Dues”.");
    const cents = parseMoney(priceText);
    if (cents === null) return Alert.alert("Price", "Enter a price like 25 or 25.50.");
    let stock: Record<string, number> | undefined;
    if (trackStock && kind !== "dues") {
      stock = {};
      for (const k of stockKeys) {
        const n = parseInt(stockText[k] ?? "", 10);
        stock[k] = Number.isFinite(n) ? Math.min(PAY_STOCK_MAX, Math.max(0, n)) : 0;
      }
    }
    setSaving(true);
    try {
      await onSave({ title: t, kind, priceCents: cents, description, options, stock, active });
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
          <Text style={styles.headTitle}>{item ? "Edit item" : "New item"}</Text>
          <Pressable onPress={save} hitSlop={10} disabled={saving}>
            <Text style={[styles.save, saving && { opacity: 0.4 }]}>Save</Text>
          </Pressable>
        </View>
        <KeyboardAwareScrollView contentContainerStyle={styles.body} bottomOffset={24} keyboardShouldPersistTaps="handled">
          {!item && (
            <View style={styles.presets}>
              {PRESETS.map((p) => (
                <Pressable key={p.label} style={styles.preset} onPress={() => applyPreset(p.draft)}>
                  <Text style={styles.presetText}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <Text style={styles.label}>Type</Text>
          <View style={styles.row}>
            {KINDS.map((k) => (
              <Pressable key={k} onPress={() => setKind(k)} style={[styles.pill, kind === k && styles.pillOn]}>
                <Text style={[styles.pillText, kind === k && styles.pillTextOn]}>
                  {PAY_ITEM_KIND_INFO[k].emoji} {PAY_ITEM_KIND_INFO[k].name}
                </Text>
              </Pressable>
            ))}
          </View>
          {kind === "dues" && (
            <Text style={styles.help}>Dues are one per member, and you'll see who hasn't paid.</Text>
          )}

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={(v) => setTitle(v.slice(0, PAY_TITLE_MAX))}
            placeholder={kind === "dues" ? "2027 Season Dues" : "Club T-shirt"}
            placeholderTextColor={colors.muted}
          />

          <Text style={styles.label}>Price ($)</Text>
          <TextInput
            style={styles.input}
            value={priceText}
            onChangeText={setPriceText}
            placeholder="25"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Details (optional)</Text>
          <TextInput
            style={[styles.input, styles.multi]}
            value={description}
            onChangeText={(v) => setDescription(v.slice(0, PAY_DESC_MAX))}
            placeholder={kind === "dues" ? "Covers canoe insurance and race fees. Due by Jan 31." : "Pick up at Saturday practice."}
            placeholderTextColor={colors.muted}
            multiline
          />

          {kind !== "dues" && (
            <>
              <Text style={styles.label}>Sizes / options (optional)</Text>
              <TextInput
                style={styles.input}
                value={optionsText}
                onChangeText={setOptionsText}
                placeholder="S, M, L, XL"
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
              />
              <Text style={styles.help}>Separate with commas.</Text>

              <View style={styles.switchRow}>
                <View style={styles.flex}>
                  <Text style={styles.switchLabel}>Track inventory</Text>
                  <Text style={styles.help}>Counts down as members buy, and shows “sold out”.</Text>
                </View>
                <Switch value={trackStock} onValueChange={setTrackStock} />
              </View>
              {trackStock && (
                <View style={styles.stockGrid}>
                  {stockKeys.map((k) => (
                    <View key={k} style={styles.stockCell}>
                      <Text style={styles.stockLabel}>{k === NO_OPTION ? "In stock" : k}</Text>
                      <TextInput
                        style={[styles.input, styles.stockInput]}
                        value={stockText[k] ?? ""}
                        onChangeText={(v) => setStockText((s) => ({ ...s, [k]: v.replace(/\D/g, "") }))}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={colors.muted}
                      />
                      {soldFor(k) > 0 && <Text style={styles.soldNote}>{soldFor(k)} sold</Text>}
                    </View>
                  ))}
                </View>
              )}
              {trackStock && (
                <Text style={styles.help}>Enter the total you had, including any already sold.</Text>
              )}
            </>
          )}

          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text style={styles.switchLabel}>Show to members</Text>
              <Text style={styles.help}>Turn off to hide it without losing who paid.</Text>
            </View>
            <Switch value={active} onValueChange={setActive} />
          </View>

          {(() => {
            const cents = parseMoney(priceText);
            return cents !== null && title.trim() ? (
              <Text style={styles.preview}>
                Members will see: {title.trim()} · {formatMoney(cents)}
                {options.length ? ` · ${options.join(" / ")}` : ""}
              </Text>
            ) : null;
          })()}

          <Button title={saving ? "Saving…" : "Save"} gradient="ocean" onPress={save} disabled={saving} style={styles.saveBtn} />
          {item && onDelete && (
            <Button title="Delete item" variant="danger" onPress={onDelete} style={styles.saveBtn} />
          )}
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

export const editorStyles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.bgSoft },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: colors.white,
  },
  headTitle: { fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.ink },
  cancel: { fontSize: type.size.md, color: colors.muted },
  save: { fontSize: type.size.md, fontWeight: type.weight.heavy, color: colors.ocean },
  body: { padding: spacing.lg, paddingBottom: 80 },
  label: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.ink, marginTop: spacing.md, marginBottom: spacing.xs },
  help: { fontSize: type.size.xs, color: colors.muted, marginTop: 4, lineHeight: 16 },
  input: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: type.size.md,
    color: colors.ink,
  },
  multi: { minHeight: 70, textAlignVertical: "top" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  pillOn: { borderColor: colors.ocean, backgroundColor: colors.ocean },
  pillText: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.ink },
  pillTextOn: { color: colors.white },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.lg },
  switchLabel: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink },
  flex: { flex: 1 },
  saveBtn: { marginTop: spacing.lg },
});

const styles = StyleSheet.create({
  ...editorStyles,
  presets: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.xs },
  preset: { backgroundColor: colors.sandLight, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  presetText: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.inkSoft },
  stockGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  stockCell: { width: 84 },
  stockLabel: { fontSize: type.size.xs, fontWeight: type.weight.bold, color: colors.muted, marginBottom: 4 },
  stockInput: { textAlign: "center" },
  soldNote: { fontSize: 10, color: colors.muted, marginTop: 2, textAlign: "center" },
  preview: { fontSize: type.size.sm, color: colors.ocean, marginTop: spacing.lg, fontWeight: type.weight.bold },
});
