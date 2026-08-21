import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { isGuestMode, watchAuth } from "@/services/auth";
import { getUserClubs } from "@/services/clubService";
import { Logo } from "@/ui/Logo";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, spacing } from "@/ui/theme";

export default function Index() {
  const [state, setState] = useState<"loading" | "in" | "inClub" | "out" | "needName">("loading");

  useEffect(() => {
    return watchAuth((user) => {
      if (user) {
        // Signed in but no display name (common with Apple) → force the name
        // gate before entering, so they never appear as "Member".
        if (!user.displayName?.trim()) {
          setState("needName");
          return;
        }
        // Club members land on the Club tab by default; everyone else on
        // Sessions. Fall back to Sessions if the club lookup fails.
        setState("loading");
        void getUserClubs(user.uid)
          .then((uc) => setState(uc?.activeClubId ? "inClub" : "in"))
          .catch(() => setState("in"));
        return;
      }
      // Signed out — guests who chose "explore without an account" go
      // straight to the tabs; recording works fully offline.
      void isGuestMode().then((guest) => setState(guest ? "in" : "out"));
    });
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

  if (state === "inClub") return <Redirect href="/(tabs)/club" />;
  if (state === "in") return <Redirect href="/(tabs)" />;
  if (state === "needName") return <Redirect href="/complete-profile" />;
  return <Redirect href="/onboarding" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
