import { GoogleSignin, isSuccessResponse } from "@react-native-google-signin/google-signin";
import * as AppleAuthentication from "expo-apple-authentication";
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
import {
  appleSignInAvailable,
  friendlyAuthError,
  setGuestMode,
  signInWithApple,
  signInWithGoogleTokens,
} from "@/services/auth";
import { Button } from "@/ui/Button";
import { Logo } from "@/ui/Logo";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, spacing, type } from "@/ui/theme";

// The project's Web (type 3) OAuth client ID — set in EAS env as
// EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID. @react-native-google-signin uses it as the
// server client ID so the Google ID token's audience is the Web client, which
// is what Firebase requires. The Android OAuth client (matched by package +
// SHA-1) is resolved automatically by Google Play Services — no need to pass it.
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
// iOS additionally needs its own iOS OAuth client (matched by bundle ID) —
// the same env var also drives the URL-scheme config plugin in app.config.js,
// so a binary built without it has no scheme and the button must stay hidden.
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_CONFIGURED =
  !!GOOGLE_WEB_CLIENT_ID && (Platform.OS !== "ios" || !!GOOGLE_IOS_CLIENT_ID);

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
      const user = await signInWithApple();
      void setGuestMode(false);
      router.replace(user.displayName?.trim() ? "/(tabs)" : "/complete-profile");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Sign-in failed", msg);
    }
  };

  const handleGuest = async () => {
    await setGuestMode(true);
    router.replace("/(tabs)");
  };

  // Native Google Sign-In on both platforms. Android resolves its OAuth client
  // via Play Services; iOS needs GOOGLE_IOS_CLIENT_ID (and the matching URL
  // scheme baked into the binary). Apple's guideline 4.8 is satisfied because
  // Sign in with Apple is always offered first on iOS.
  const showGoogle = Platform.OS === "android" || Platform.OS === "ios";

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
          {showGoogle && !GOOGLE_CONFIGURED && Platform.OS === "android" && (
            <Button
              title="Continue with Google"
              variant="outline"
              disabled
              onPress={() => Alert.alert("Not configured", "Google Sign-In requires EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to be set.")}
              style={styles.googleBtn}
            />
          )}
          <Button
            title="Continue with email"
            variant="outline"
            onPress={() => router.push("/email-auth")}
            style={styles.googleBtn}
          />
          <Text style={styles.guestLink} onPress={handleGuest}>
            Explore without an account
          </Text>
          <Text style={styles.guestNote}>
            Record paddles right away — sign in later to sync and join a club.
          </Text>
        </Animated.View>
      </View>
    </ScreenBackground>
  );
}

/**
 * Native Google Sign-In (@react-native-google-signin). Uses the platform's
 * native account picker (Play Services on Android, the Google iOS SDK sheet on
 * iOS) — no browser redirect, so it avoids the OAuth "invalid_request" errors
 * of the web-based flow. Returns an ID token whose audience is the Web client,
 * which Firebase accepts.
 */
function GoogleSignInButton() {
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      // iOS-only: which OAuth client this app is. Android ignores it (its
      // client is matched by package name + SHA-1 via Play Services).
      iosClientId: GOOGLE_IOS_CLIENT_ID,
    });
  }, []);

  const onPress = async () => {
    setSigningIn(true);
    try {
      if (Platform.OS === "android") {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      }
      const res = await GoogleSignin.signIn();
      if (!isSuccessResponse(res)) return; // user cancelled the picker
      const idToken = res.data.idToken;
      if (!idToken) {
        Alert.alert("Sign-in failed", "No ID token returned by Google.");
        return;
      }
      const user = await signInWithGoogleTokens(idToken, null);
      void setGuestMode(false);
      router.replace(user.displayName?.trim() ? "/(tabs)" : "/complete-profile");
    } catch (e) {
      Alert.alert("Sign-in failed", friendlyAuthError(e));
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <Button
      title={signingIn ? "Signing in…" : "Continue with Google"}
      variant="outline"
      onPress={() => void onPress()}
      disabled={signingIn}
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
  guestLink: {
    color: colors.white,
    textAlign: "center",
    fontWeight: type.weight.bold,
    fontSize: type.size.md,
    textDecorationLine: "underline",
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
  },
  guestNote: {
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    fontSize: type.size.xs,
    marginTop: -spacing.sm,
  },
});
