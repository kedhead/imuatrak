import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CRAFT_TYPES, type CraftType } from "@/models";
import { signOut, watchAuth, type AuthUser } from "@/services/auth";
import { useSettings, type Units } from "@/services/settings";
import { Button } from "@/ui/Button";
import { colors, radii, spacing } from "@/ui/theme";

export default function Settings() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const units = useSettings((s) => s.units);
  const defaultCraft = useSettings((s) => s.defaultCraft);
  const setUnits = useSettings((s) => s.setUnits);
  const setDefaultCraft = useSettings((s) => s.setDefaultCraft);

  useEffect(() => watchAuth(setUser), []);

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
            onChange={(u) => void setUnits(u)}
          />
        </Section>

        <Section title="Default craft">
          <Choice
            options={CRAFT_TYPES.map((c) => ({ label: c, value: c }))}
            value={defaultCraft}
            onChange={(c) => void setDefaultCraft(c)}
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
