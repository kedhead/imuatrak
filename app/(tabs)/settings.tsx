import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CRAFT_TYPES, type CraftType } from "@/models";
import { signOut, watchAuth, type AuthUser } from "@/services/auth";
import { Button } from "@/ui/Button";
import { colors, radii, spacing } from "@/ui/theme";

const KEY_UNITS = "imuatrak.units";
const KEY_DEFAULT_CRAFT = "imuatrak.defaultCraft";

export default function Settings() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [units, setUnits] = useState<"metric" | "imperial">("metric");
  const [defaultCraft, setDefaultCraft] = useState<CraftType>("OC1");

  useEffect(() => watchAuth(setUser), []);
  useEffect(() => {
    void AsyncStorage.getItem(KEY_UNITS).then((u) => u && setUnits(u as "metric" | "imperial"));
    void AsyncStorage.getItem(KEY_DEFAULT_CRAFT).then(
      (c) => c && setDefaultCraft(c as CraftType),
    );
  }, []);

  const persistUnits = (u: "metric" | "imperial") => {
    setUnits(u);
    void AsyncStorage.setItem(KEY_UNITS, u);
  };
  const persistCraft = (c: CraftType) => {
    setDefaultCraft(c);
    void AsyncStorage.setItem(KEY_DEFAULT_CRAFT, c);
  };

  const onSignOut = () => {
    Alert.alert("Sign out?", "You'll need to sign in again to sync sessions.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/onboarding");
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <Section title="Account">
          <Text style={styles.body}>{user?.email ?? user?.uid ?? "Not signed in"}</Text>
          {user && <Button title="Sign out" variant="danger" onPress={onSignOut} />}
        </Section>

        <Section title="Units">
          <Choice
            options={[
              { label: "Metric (km)", value: "metric" },
              { label: "Imperial (mi)", value: "imperial" },
            ]}
            value={units}
            onChange={persistUnits}
          />
        </Section>

        <Section title="Default craft">
          <Choice
            options={CRAFT_TYPES.map((c) => ({ label: c, value: c }))}
            value={defaultCraft}
            onChange={persistCraft}
          />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={{ gap: spacing.sm }}>{children}</View>
    </View>
  );
}

function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.choices}>
      {options.map((o) => (
        <Text
          key={o.value}
          onPress={() => onChange(o.value)}
          style={[styles.choice, o.value === value && styles.choiceOn]}
        >
          {o.label}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  body: { color: colors.ink },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.muted,
    textTransform: "uppercase",
  },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  choice: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    color: colors.ink,
    overflow: "hidden",
  },
  choiceOn: { backgroundColor: colors.blue, color: "#fff" },
});
