import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  friendlyAuthError,
  sendPasswordReset,
  setGuestMode,
  signInWithEmail,
  signUpWithEmail,
  type AuthUser,
} from "@/services/auth";
import { Button } from "@/ui/Button";
import { Logo } from "@/ui/Logo";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, radii, spacing, type } from "@/ui/theme";

/**
 * Email/password sign-in and account creation, reached from the onboarding
 * "Continue with email" button. One screen with a mode toggle rather than two
 * routes, so switching between "I have an account" and "I'm new" keeps
 * whatever was already typed.
 */
export default function EmailAuth() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const emailValid = /\S+@\S+\.\S+/.test(email.trim());
  const valid =
    emailValid && password.length >= 6 && (mode === "signIn" || name.trim().length >= 2);

  const finish = (user: AuthUser) => {
    void setGuestMode(false);
    router.replace(user.displayName?.trim() ? "/(tabs)" : "/complete-profile");
  };

  const onSubmit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const user =
        mode === "signIn"
          ? await signInWithEmail(email, password)
          : await signUpWithEmail(name, email, password);
      finish(user);
    } catch (e) {
      Alert.alert(mode === "signIn" ? "Sign-in failed" : "Sign-up failed", friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  const onForgotPassword = async () => {
    if (!emailValid) {
      Alert.alert("Enter your email", "Type your email address above first, then tap “Forgot password?” again.");
      return;
    }
    try {
      await sendPasswordReset(email);
      Alert.alert(
        "Check your inbox",
        `If an account exists for ${email.trim()}, a password reset link is on its way.`,
      );
    } catch (e) {
      Alert.alert("Couldn't send reset email", friendlyAuthError(e));
    }
  };

  const signIn = mode === "signIn";

  return (
    <ScreenBackground gradient="night">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.container,
            { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <Logo size={96} />
            <Text style={styles.title}>{signIn ? "Welcome back" : "Create your account"}</Text>
            <Text style={styles.subtitle}>
              {signIn
                ? "Sign in with your email to sync sessions and rejoin your club."
                : "Sign up with your email — sessions sync across devices and you can join a club."}
            </Text>
          </View>

          <View style={styles.form}>
            {!signIn && (
              <TextInput
                style={styles.input}
                placeholder="Your name"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoCorrect={false}
                textContentType="name"
                returnKeyType="next"
                maxLength={40}
              />
            )}
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
            />
            <TextInput
              style={styles.input}
              placeholder={signIn ? "Password" : "Password (6+ characters)"}
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              // "password" (not "newPassword") on sign-up too: iOS's strong
              // password overlay for newPassword fights the single-field layout.
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={onSubmit}
            />
            {signIn && (
              <Text style={styles.forgot} onPress={() => void onForgotPassword()}>
                Forgot password?
              </Text>
            )}
            <Button
              title={busy ? "One moment…" : signIn ? "Sign in" : "Create account"}
              gradient="sunrise"
              glow
              disabled={!valid || busy}
              onPress={() => void onSubmit()}
              style={{ marginTop: spacing.sm }}
            />
            <Text style={styles.switchMode} onPress={() => setMode(signIn ? "signUp" : "signIn")}>
              {signIn ? "New here? Create an account" : "Already have an account? Sign in"}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, padding: spacing.xxl, justifyContent: "space-between" },
  hero: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md, paddingVertical: spacing.xl },
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
  forgot: {
    color: "rgba(255,255,255,0.75)",
    textAlign: "right",
    fontSize: type.size.sm,
    textDecorationLine: "underline",
    paddingVertical: spacing.xs,
  },
  switchMode: {
    color: colors.white,
    textAlign: "center",
    fontWeight: type.weight.bold,
    fontSize: type.size.md,
    textDecorationLine: "underline",
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
  },
});
