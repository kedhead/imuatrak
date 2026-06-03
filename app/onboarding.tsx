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

export default function Onboarding() {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [signingInGoogle, setSigningInGoogle] = useState(false);
  const insets = useSafeAreaInsets();

  // Google OAuth — client IDs come from env vars set in .env / EAS secrets:
  //   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID     (iOS OAuth 2.0 client from Google Cloud)
  //   EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID (Android OAuth 2.0 client)
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  const bob = useSharedValue(0);
  useEffect(() => {
    void appleSignInAvailable().then(setAppleAvailable);
    bob.value = withRepeat(
      withTiming(-10, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [bob]);

  useEffect(() => {
    if (response?.type !== "success") return;
    const accessToken = response.authentication?.accessToken;
    if (!accessToken) { Alert.alert("Sign-in failed", "No access token returned by Google."); return; }
    setSigningInGoogle(true);
    signInWithGoogleAccessToken(accessToken)
      .then(() => router.replace("/(tabs)"))
      .catch((e) => Alert.alert("Sign-in failed", e instanceof Error ? e.message : String(e)))
      .finally(() => setSigningInGoogle(false));
  }, [response]);

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

  const handleGoogle = async () => {
    if (!request) {
      Alert.alert("Not configured", "Google Sign-In requires client IDs in your environment variables.");
      return;
    }
    await promptAsync();
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
          {showGoogle && (
            <Button
              title={signingInGoogle ? "Signing in…" : "Continue with Google"}
              variant="outline"
              onPress={handleGoogle}
              disabled={signingInGoogle}
              style={styles.googleBtn}
            />
          )}
        </Animated.View>
      </View>
    </ScreenBackground>
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
