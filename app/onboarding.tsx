import * as AppleAuthentication from "expo-apple-authentication";
import * as Google from "expo-auth-session/providers/google";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Platform, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { appleSignInAvailable, signInWithApple, signInWithGoogleAccessToken } from "@/services/auth";
import { Button } from "@/ui/Button";
import { Logo } from "@/ui/Logo";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, spacing, type } from "@/ui/theme";

// Google OAuth client IDs — set in EAS secrets or local .env.
// Evaluated at build time; undefined when not configured.
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
// Only mount the Google auth component when at least one ID is available.
// This prevents expo-auth-session from crashing when IDs are missing.
const GOOGLE_CONFIGURED = !!(GOOGLE_IOS_CLIENT_ID || GOOGLE_ANDROID_CLIENT_ID);

export default function Onboarding() {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const insets = useSafeAreaInsets();

  const bob = useSharedValue(0);
  useEffect(() => {
    void appleSignInAvailable().then(setAppleAvailable);
    bob.value = withRepeat(
      withTiming(-10, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [bob]);

  const logoStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));

  const handleApple = async () => {
    try {
      await signInWithApple();
      router.replace("/(tabs)");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Sign-in failed", msg);
    }
  };

  // Show Google on Android always; on iOS only when Apple Sign-In isn't available
  const showGoogle = Platform.OS === "android" || !appleAvailable;

  return (
    <ScreenBackground gradient="night">
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.hero}>
          <Animated.View entering={FadeInDown.duration(700)} style={logoStyle}>
            <Logo size={150} />
          </Animated.View>
          <Animated.Text entering={FadeInDown.delay(200).duration(700)} style={styles.title}>
            ImuaTrak
          </Animated.Text>
          <Animated.Text entering={FadeIn.delay(450).duration(700)} style={styles.tag}>
            Track every paddle — distance, pace, stroke rate, and the whole journey forward.
          </Animated.Text>
        </View>

        <Animated.View entering={FadeInUp.delay(550).duration(700)} style={styles.actions}>
          {appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={26}
              style={styles.appleButton}
              onPress={handleApple}
            />
          )}
          {showGoogle && GOOGLE_CONFIGURED && (
            <GoogleSignInButton />
          )}
          {showGoogle && !GOOGLE_CONFIGURED && (
            <Button
              title="Continue with Google"
              variant="outline"
              disabled
              onPress={() => Alert.alert("Not configured", "Google Sign-In requires EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID / EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID to be set.")}
              style={styles.googleBtn}
            />
          )}
        </Animated.View>
      </View>
    </ScreenBackground>
  );
}

/**
 * Isolated component so that Google.useAuthRequest (which validates client IDs
 * eagerly and can throw) is only mounted when GOOGLE_CONFIGURED is true.
 * Hooks must be called unconditionally within a component, but a component
 * itself can be conditionally rendered.
 */
function GoogleSignInButton() {
  const [signingIn, setSigningIn] = useState(false);
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type !== "success") return;
    const accessToken = response.authentication?.accessToken;
    if (!accessToken) { Alert.alert("Sign-in failed", "No access token returned by Google."); return; }
    setSigningIn(true);
    signInWithGoogleAccessToken(accessToken)
      .then(() => router.replace("/(tabs)"))
      .catch((e) => Alert.alert("Sign-in failed", e instanceof Error ? e.message : String(e)))
      .finally(() => setSigningIn(false));
  }, [response]);

  return (
    <Button
      title={signingIn ? "Signing in…" : "Continue with Google"}
      variant="outline"
      onPress={() => { if (request) promptAsync(); }}
      disabled={signingIn || !request}
      style={styles.googleBtn}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.xxl, justifyContent: "space-between" },
  hero: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md },
  title: {
    fontSize: type.size.hero,
    fontWeight: type.weight.heavy,
    color: colors.white,
    letterSpacing: type.spacing.tight,
    marginTop: spacing.sm,
  },
  tag: {
    color: "rgba(255,255,255,0.82)",
    textAlign: "center",
    paddingHorizontal: spacing.lg,
    fontSize: type.size.lg,
    lineHeight: 24,
  },
  actions: { gap: spacing.md, paddingBottom: spacing.lg },
  appleButton: { height: 52 },
  googleBtn: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.4)",
  },
});
