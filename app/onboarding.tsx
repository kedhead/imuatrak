import * as AppleAuthentication from "expo-apple-authentication";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Platform, StyleSheet, Text, View } from "react-native";
import { Button } from "@/ui/Button";
import { colors, spacing } from "@/ui/theme";
import { appleSignInAvailable, signInWithApple } from "@/services/auth";

export default function Onboarding() {
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    void appleSignInAvailable().then(setAppleAvailable);
  }, []);

  const handleApple = async () => {
    try {
      await signInWithApple();
      router.replace("/(tabs)");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Sign-in failed", msg);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.title}>Paddleup</Text>
        <Text style={styles.tag}>
          Track your outrigger sessions — distance, pace, stroke rate, and more.
        </Text>
      </View>

      <View style={styles.actions}>
        {appleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={styles.appleButton}
            onPress={handleApple}
          />
        )}
        {Platform.OS === "android" && (
          <Button
            title="Continue with Google (coming soon)"
            variant="outline"
            onPress={() => Alert.alert("Coming soon", "Google sign-in lands in Phase 1.5.")}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.xxl, justifyContent: "space-between" },
  hero: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md },
  title: { fontSize: 36, fontWeight: "700", color: colors.ink },
  tag: { color: colors.muted, textAlign: "center", paddingHorizontal: spacing.lg },
  actions: { gap: spacing.md, paddingBottom: spacing.lg },
  appleButton: { height: 50 },
});
