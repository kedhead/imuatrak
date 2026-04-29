import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { watchAuth, type AuthUser } from "@/services/auth";

/**
 * Auth gate. Routes signed-in users to the tab navigator and unsigned users
 * to onboarding. Briefly shows a spinner while Firebase reports its
 * persisted session.
 */
export default function Index() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  useEffect(() => watchAuth((u) => setUser(u)), []);

  if (user === undefined) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Redirect href={user ? "/(tabs)" : "/onboarding"} />;
}
