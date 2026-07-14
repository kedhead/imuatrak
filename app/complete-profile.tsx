import { router } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { currentUser, updateDisplayName } from "@/services/auth";
import { syncMemberDisplayName } from "@/services/clubService";
import { Button } from "@/ui/Button";
import { Logo } from "@/ui/Logo";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, radii, spacing, type } from "@/ui/theme";

/**
 * Name gate. Shown after sign-in when the account has no display name (Apple
 * often returns none). Blocks entry to the app until a name is entered, so a
 * paddler never lands in a club roster or chat as the literal "Member".
 */
export default function CompleteProfile() {
  const insets = useSafeAreaInsets();
  const user = currentUser();
  const [name, setName] = useState(user?.displayName ?? "");
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();
  const valid = trimmed.length >= 2;

  const onContinue = async () => {
    if (!valid || !user) return;
    setSaving(true);
    try {
      await updateDisplayName(trimmed);
      // Backfill any club membership that was created before the name existed.
      await syncMemberDisplayName(user.uid, trimmed).catch(() => undefined);
      router.replace("/(tabs)");
    } catch {
      Alert.alert("Couldn't save", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenBackground gradient="night">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.container, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.hero}>
            <Logo size={96} />
            <Text style={styles.title}>What&apos;s your name?</Text>
            <Text style={styles.subtitle}>
              This is how your crew sees you in club rosters, chat, and events.
            </Text>
          </View>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoCorrect={false}
              autoFocus
              returnKeyType="done"
              maxLength={40}
              onSubmitEditing={onContinue}
            />
            <Button
              title={saving ? "Saving…" : "Continue"}
              gradient="sunrise"
              glow
              disabled={!valid || saving}
              onPress={onContinue}
              style={{ marginTop: spacing.md }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, padding: spacing.xxl, justifyContent: "space-between" },
  hero: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md },
  title: {
    fontSize: type.size.xxl,
    fontWeight: type.weight.heavy,
    color: colors.white,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  subtitle: {
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    paddingHorizontal: spacing.md,
    fontSize: type.size.md,
    lineHeight: 22,
  },
  form: { gap: spacing.sm },
  input: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.35)",
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: type.size.lg,
    color: colors.white,
  },
});
