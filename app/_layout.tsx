import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";
import { useSettings } from "@/services/settings";
import { useRecorder } from "@/services/recorder";
import { useClub } from "@/services/clubStore";
import { watchAuth } from "@/services/auth";

export default function RootLayout() {
  const loadSettings = useSettings((s) => s.load);
  const defaultCraft = useSettings((s) => s.defaultCraft);
  const loaded = useSettings((s) => s.loaded);
  const setCraftType = useRecorder((s) => s.setCraftType);
  const isRecording = useRecorder((s) => s.isRecording);
  const loadClub = useClub((s) => s.load);
  const clearClub = useClub((s) => s.clearClub);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (loaded && !isRecording) setCraftType(defaultCraft);
  }, [loaded, defaultCraft, isRecording, setCraftType]);

  // Load club context whenever auth state changes.
  useEffect(() => {
    return watchAuth((user) => {
      if (user) void loadClub(user.uid);
      else clearClub();
    });
  }, [loadClub, clearClub]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="record" options={{ presentation: "modal" }} />
          <Stack.Screen name="session/[id]" options={{ headerShown: true, title: "Session" }} />
          <Stack.Screen name="club/create" options={{ headerShown: true, title: "Create Club" }} />
          <Stack.Screen name="club/join" options={{ headerShown: true, title: "Join Club" }} />
          <Stack.Screen name="club/members" options={{ headerShown: true, title: "Members" }} />
          <Stack.Screen name="club/event/[id]" options={{ headerShown: true, title: "Event" }} />
          <Stack.Screen name="club/events" options={{ headerShown: true, title: "Events" }} />
          <Stack.Screen name="club/admin/index" options={{ headerShown: true, title: "Club Settings" }} />
          <Stack.Screen name="club/admin/invite" options={{ headerShown: true, title: "Invite Members" }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
