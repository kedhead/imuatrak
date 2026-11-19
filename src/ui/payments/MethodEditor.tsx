import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import {
  PAY_HANDLE_MAX,
  PAY_INSTRUCTIONS_MAX,
  PAY_METHOD_INFO,
  type PayMethod,
  type PayMethodKind,
} from "@/models/payments";
import type { PayMethodDraft } from "@/services/paymentService";
import { Button } from "../Button";
import { colors, radii, spacing, type } from "../theme";
import { editorStyles } from "./ItemEditor";

const KINDS: PayMethodKind[] = ["zelle", "venmo", "paypal", "cashapp", "link", "other"];

const INSTRUCTION_HINT: Record<PayMethodKind, string> = {
  zelle: "e.g. Registered as “Kailua Canoe Club”. Put your name in the memo.",
  venmo: "e.g. Business profile, the one with our club logo.",
  paypal: "e.g. Choose “Friends and Family” to avoid fees.",
  cashapp: "e.g. Include your name in the note.",
  link: "e.g. Order online, pick up at practice.",
  other: "e.g. Cash or checks to Auntie Lei at Saturday practice. Checks payable to “Kailua Canoe Club”.",
};

export function MethodEditor({
  visible,
  method,
  onSave,
  onUploadQr,
  onDelete,
  onClose,
}: {
  visible: boolean;
  method: PayMethod | null;
  onSave: (draft: PayMethodDraft) => Promise<void>;
  onUploadQr: (uri: string, mimeType: string) => Promise<string>;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<PayMethodKind>("zelle");
  const [handle, setHandle] = useState("");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [instructions, setInstructions] = useState("");
  const [qrUrl, setQrUrl] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setKind(method?.kind ?? "zelle");
    setHandle(method?.handle ?? "");
    setUrl(method?.url ?? "");
    setLabel(method?.label ?? "");
    setInstructions(method?.instructions ?? "");
    setQrUrl(method?.qrUrl);
  }, [visible, method]);

  const info = PAY_METHOD_INFO[kind];

  const pickQr = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to upload your QR code screenshot.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 1 });
    const a = res.canceled ? undefined : res.assets[0];
    if (!a) return;
    setUploading(true);
    try {
      setQrUrl(await onUploadQr(a.uri, a.mimeType ?? "image/jpeg"));
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (info.handleLabel && !handle.trim() && !qrUrl) {
      return Alert.alert(info.name, `Add the ${info.handleLabel.toLowerCase()} members should pay.`);
    }
    if (kind === "link" && !url.trim()) return Alert.alert("Link", "Paste the store or checkout link.");
    if (kind === "other" && !instructions.trim()) return Alert.alert("Instructions", "Tell members how to pay.");
    setSaving(true);
    try {
      await onSave({
        kind,
        handle: info.handleLabel ? handle : undefined,
        url: kind === "link" ? url : undefined,
        label,
        instructions,
        qrUrl,
      });
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
          <Text style={styles.headTitle}>{method ? "Edit payment option" : "Add payment option"}</Text>
          <Pressable onPress={save} hitSlop={10} disabled={saving || uploading}>
            <Text style={[styles.save, (saving || uploading) && { opacity: 0.4 }]}>Save</Text>
          </Pressable>
        </View>
        <KeyboardAwareScrollView contentContainerStyle={styles.body} bottomOffset={24} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>How do members pay?</Text>
          <View style={styles.row}>
            {KINDS.map((k) => (
              <Pressable key={k} onPress={() => setKind(k)} style={[styles.pill, kind === k && styles.pillOn]}>
                <Text style={[styles.pillText, kind === k && styles.pillTextOn]}>
                  {PAY_METHOD_INFO[k].emoji} {PAY_METHOD_INFO[k].name}
                </Text>
              </Pressable>
            ))}
          </View>

          {info.handleLabel && (
            <>
              <Text style={styles.label}>{info.handleLabel}</Text>
              <TextInput
                style={styles.input}
                value={handle}
                onChangeText={(v) => setHandle(v.slice(0, PAY_HANDLE_MAX))}
                placeholder={info.handlePlaceholder}
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={kind === "zelle" ? "email-address" : "default"}
              />
              {kind !== "zelle" && (
                <Text style={styles.help}>
                  Members get a button that opens {info.name} with the amount{kind === "venmo" ? " and memo" : ""} filled in.
                </Text>
              )}
            </>
          )}

          {kind === "link" && (
            <>
              <Text style={styles.label}>Store or checkout link</Text>
              <TextInput
                style={styles.input}
                value={url}
                onChangeText={setUrl}
                placeholder="https://square.link/…"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </>
          )}

          <Text style={styles.label}>Instructions {kind === "other" ? "" : "(optional)"}</Text>
          <TextInput
            style={[styles.input, styles.multi]}
            value={instructions}
            onChangeText={(v) => setInstructions(v.slice(0, PAY_INSTRUCTIONS_MAX))}
            placeholder={INSTRUCTION_HINT[kind]}
            placeholderTextColor={colors.muted}
            multiline
          />

          {kind !== "link" && (
            <>
              <Text style={styles.label}>QR code (optional)</Text>
              <Text style={styles.help}>
                {kind === "zelle"
                  ? "In your bank app open Zelle → your QR code, take a screenshot, and upload it here. Handy for paying in person at practice."
                  : "A screenshot of your payment QR code, for paying in person."}
              </Text>
              <View style={styles.qrRow}>
                {qrUrl ? <Image source={{ uri: qrUrl }} style={styles.qr} contentFit="contain" /> : null}
                <View style={styles.qrBtns}>
                  {uploading ? (
                    <ActivityIndicator color={colors.ocean} />
                  ) : (
                    <Pressable style={styles.qrBtn} onPress={pickQr} hitSlop={6}>
                      <Ionicons name="qr-code-outline" size={18} color={colors.ocean} />
                      <Text style={styles.qrBtnText}>{qrUrl ? "Replace QR" : "Upload QR"}</Text>
                    </Pressable>
                  )}
                  {qrUrl && !uploading && (
                    <Pressable onPress={() => setQrUrl(undefined)} hitSlop={8}>
                      <Text style={styles.remove}>Remove</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </>
          )}

          <Text style={styles.label}>Display name (optional)</Text>
          <TextInput
            style={styles.input}
            value={label}
            onChangeText={(v) => setLabel(v.slice(0, 40))}
            placeholder={info.name}
            placeholderTextColor={colors.muted}
          />

          <Button title={saving ? "Saving…" : "Save"} gradient="ocean" onPress={save} disabled={saving || uploading} style={styles.saveBtn} />
          {method && onDelete && (
            <Button title="Remove payment option" variant="danger" onPress={onDelete} style={styles.saveBtn} />
          )}
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  ...editorStyles,
  qrRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  qr: { width: 110, height: 110, borderRadius: radii.md, backgroundColor: colors.white },
  qrBtns: { flex: 1, gap: spacing.sm, alignItems: "flex-start" },
  // A compact pill, not <Button>: Button's inner view is flex: 1, which in
  // this unbounded scroll sheet grew it to fill the screen.
  qrBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1.5,
    borderColor: colors.ocean,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
  },
  qrBtnText: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ocean },
  remove: { fontSize: type.size.sm, color: colors.danger, fontWeight: type.weight.bold },
});
