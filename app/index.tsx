import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { watchAuth } from "@/services/auth";
import { Logo } from "@/ui/Logo";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, spacing } from "@/ui/theme";

export default function Index() {
  const [state, setState] = useState<"loading" | "in" | "out">("loading");

  useEffect(() => {
    return watchAuth((user) => setState(user ? "in" : "out"));
  }, []);

  if (state === "loading") {
    return (
      <ScreenBackground gradient="night">
        <View style={styles.center}>
          <Logo size={120} />
          <ActivityIndicator color={colors.white} style={{ marginTop: spacing.xl }} />
        </View>
      </ScreenBackground>
    );
  }

  if (state === "in") return <Redirect href="/(tabs)" />;
  return <Redirect href="/onboarding" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
