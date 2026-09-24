import Constants from "expo-constants";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import MobileAds from "react-native-google-mobile-ads";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";
import * as Notifications from "expo-notifications";
import { useSettings } from "@/services/settings";
import { useRecorder } from "@/services/recorder";
import { useAds } from "@/services/ads";
import { useClub } from "@/services/clubStore";
import { useSubscription } from "@/services/subscriptionStore";
import { currentUser, watchAuth } from "@/services/auth";
import { setAppBadge, syncAppBadge } from "@/services/badge";
import { pruneEventReminders } from "@/services/eventReminders";
import { registerFcmToken } from "@/services/clubService";
import { AnimatedSplash } from "@/ui/AnimatedSplash";
import { colors } from "@/ui/theme";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const loadSettings = useSettings((s) => s.load);
  const defaultCraft = useSettings((s) => s.defaultCraft);
  const loaded = useSettings((s) => s.loaded);
  const setCraftType = useRecorder((s) => s.setCraftType);
  const isRecording = useRecorder((s) => s.isRecording);
  const loadClub = useClub((s) => s.load);
  const clearClub = useClub((s) => s.clearClub);
  const initSubscription = useSubscription((s) => s.initialize);
  const router = useRouter();

  // Keep the animated splash up for a beat so it can play, then cross-fade out.
  const [splashHidden, setSplashHidden] = useState(false);

  // Initialize AdMob, then present the App Tracking Transparency prompt before
  // the first ad request. Apple requires the ATT prompt to appear (the AdMob
  // SDK links the framework); personalized ads are served only on consent,
  // otherwise non-personalized ads — which need no permission.
  useEffect(() => {
    void (async () => {
      try {
        await MobileAds().initialize();
      } catch {
        // Gracefully skip if AdMob native module is somehow unavailable.
      }
      await useAds.getState().requestTracking();
    })();
  }, []);

  useEffect(() => {
    void loadSettings();
    // Hide the native (static) splash immediately; our animated one takes over.
    void SplashScreen.hideAsync();
    // Drop bookkeeping for practice reminders whose events have passed.
    void pruneEventReminders();
  }, [loadSettings]);

  useEffect(() => {
    if (loaded && !isRecording) setCraftType(defaultCraft);
  }, [loaded, defaultCraft, isRecording, setCraftType]);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => setSplashHidden(true), 1600);
    return () => clearTimeout(t);
  }, [loaded]);

  // Load club context and subscription status whenever auth state changes.
  useEffect(() => {
    return watchAuth((user) => {
      if (user) {
        void loadClub(user.uid);
        void initSubscription(user.uid);
        // Sync the app-icon badge to the user's unread total on sign-in/launch.
        void syncAppBadge(user.uid);
        // Register FCM token for push notifications (best-effort)
        void (async () => {
          try {
            const { status } = await Notifications.requestPermissionsAsync();
            if (status === "granted") {
              // Register an EXPO push token, not getDevicePushTokenAsync():
              // on iOS that returns a raw APNs hex token which FCM silently
              // rejects — the reason chat pushes never arrived. The Expo Push
              // Service handles APNs/FCM routing from one token type.
              const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
              const expoToken = await Notifications.getExpoPushTokenAsync(
                projectId ? { projectId } : undefined,
              );
              await registerFcmToken(
                user.uid,
                expoToken.data,
                Platform.OS === "ios" ? "ios" : "android",
              );
            }
          } catch (e) {
            // Still non-fatal — never block sign-in on notifications. But it
            // must not be SILENT: this bare catch is why Android going without
            // push notifications for its whole life went unnoticed. Android
            // cannot get an FCM token without google-services.json compiled in,
            // so getExpoPushTokenAsync throws here, and swallowing it left no
            // token, no log, and nothing for a user to report beyond "I don't
            // get notifications".
            console.warn("[push] token registration failed:", e);
          }
        })();
      } else {
        clearClub();
        void setAppBadge(0);
      }
    });
  }, [loadClub, clearClub, initSubscription]);

  // Re-sync the badge whenever the app returns to the foreground — messages may
  // have arrived (and pushed the badge up) or been read on another device.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      const user = currentUser();
      if (user) void syncAppBadge(user.uid);
    });
    return () => sub.remove();
  }, []);

  // Deep-link into the right channel when user taps a push notification
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (typeof data?.channelId === "string") {
        router.push(`/club/chat/${data.channelId}` as never);
      }
    });
    return () => sub.remove();
  }, [router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Android enforces edge-to-edge at targetSdk 35+, so adjustResize no
          longer resizes the window for the keyboard — the app has to read the
          IME inset itself. React Native's own KeyboardAvoidingView cannot,
          which is why inputs kept ending up behind the keyboard on Android
          whichever `behavior` was set. This provider reads the real inset, and
          the KeyboardAvoidingView from the same package (used in place of RN's
          everywhere) acts on it. */}
      {/* All three flags are about Android's edge-to-edge, which this app is
          in permanently at targetSdk 36: the status and navigation bars are
          translucent and the app draws behind them, so the provider has to
          subtract them when it works out how far the keyboard actually
          intrudes. preserveEdgeToEdge keeps that mode on rather than letting
          the module turn it off underneath us. */}
      <KeyboardProvider statusBarTranslucent navigationBarTranslucent preserveEdgeToEdge>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerShown: false,
            headerStyle: { backgroundColor: colors.ocean },
            headerTintColor: colors.white,
            headerTitleStyle: { fontWeight: "800" },
            headerShadowVisible: false,
            headerBackTitle: "",
            headerBackButtonDisplayMode: "minimal",
            contentStyle: { backgroundColor: colors.bgSoft },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="email-auth" />
          <Stack.Screen name="complete-profile" options={{ gestureEnabled: false }} />
          <Stack.Screen name="(tabs)" options={{ headerBackTitle: "", headerBackButtonDisplayMode: "minimal" }} />
          <Stack.Screen name="record" options={{ presentation: "modal" }} />
          <Stack.Screen name="session/[id]" options={{ headerShown: true, title: "Session" }} />
          <Stack.Screen name="club/create" options={{ headerShown: true, title: "Create Club" }} />
          <Stack.Screen name="club/join" options={{ headerShown: true, title: "Join Club" }} />
          <Stack.Screen name="club/members" options={{ headerShown: true, title: "Members" }} />
          <Stack.Screen name="club/member/[uid]" options={{ headerShown: true, title: "Profile" }} />
          <Stack.Screen name="club/gallery" options={{ headerShown: true, title: "Gallery" }} />
          <Stack.Screen name="club/event/[id]" options={{ headerShown: true, title: "Event" }} />
          <Stack.Screen name="club/events" options={{ headerShown: true, title: "Events" }} />
          <Stack.Screen name="club/admin" options={{ headerShown: true, title: "Club Settings" }} />
          <Stack.Screen name="club/invite" options={{ headerShown: true, title: "Invite Members" }} />
          <Stack.Screen name="club/admin/bulk-schedule" options={{ headerShown: true, title: "Bulk Schedule" }} />
          <Stack.Screen name="club/admin/channels" options={{ headerShown: true, title: "Manage Channels" }} />
          <Stack.Screen name="club/channels" options={{ headerShown: false }} />
          <Stack.Screen name="club/chat/[channelId]" options={{ headerShown: true, title: "" }} />
          <Stack.Screen name="club/chat" options={{ headerShown: true, title: "Club Chat" }} />
          <Stack.Screen name="dm/index" options={{ headerShown: true, title: "Messages" }} />
          <Stack.Screen name="dm/[threadId]" options={{ headerShown: true, title: "" }} />
          <Stack.Screen name="paywall" options={{ presentation: "modal", headerShown: false }} />
        </Stack>
        {!splashHidden && <AnimatedSplash hidden={loaded} />}
      </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
