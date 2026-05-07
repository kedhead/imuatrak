import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";
import { useSettings } from "@/services/settings";
import { useRecorder } from "@/services/recorder";

export default function RootLayout() {
  const loadSettings = useSettings((s) => s.load);
  const defaultCraft = useSettings((s) => s.defaultCraft);
  const loaded = useSettings((s) => s.loaded);
  const setCraftType = useRecorder((s) => s.setCraftType);
  const isRecording = useRecorder((s) => s.isRecording);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // Once settings load, seed the recorder's craft with the user's default
  // (only when not mid-session so we don't interrupt an active recording).
  useEffect(() => {
    if (loaded && !isRecording) setCraftType(defaultCraft);
  }, [loaded, defaultCraft, isRecording, setCraftType]);

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
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
