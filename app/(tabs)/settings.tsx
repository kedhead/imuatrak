import { Ionicons } from "@expo/vector-icons";
import { router, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CRAFT_TYPES, type CraftType } from "@/models";
import { signOut, watchAuth, type AuthUser } from "@/services/auth";
import { leaveClub } from "@/services/clubService";
import { useClub } from "@/services/clubStore";
import { useSettings, type Units } from "@/services/settings";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { GradientCard } from "@/ui/GradientCard";
import { GradientHeader } from "@/ui/GradientHeader";
import { Pill } from "@/ui/Pill";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, radii, spacing, type } from "@/ui/theme";

export default function Settings() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const units = useSettings((s) => s.units);
  const defaultCraft = useSettings((s) => s.defaultCraft);
  const setUnits = useSettings((s) => s.setUnits);
  const setDefaultCraft = useSettings((s) => s.setDefaultCraft);
  const club = useClub((s) => s.club);
  const role = useClub((s) => s.role);
  const loaded = useClub((s) => s.loaded);
  const clearClub = useClub((s) => s.clearClub);
  const routerHook = useRouter();

  useEffect(() => watchAuth(setUser), []);

  const onLeaveClub = () => {
    if (!club || !user) return;
    Alert.alert(
      "Leave club?",
      `You will be removed from ${club.name}. You can rejoin with an invite link.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            await leaveClub(club.id, user.uid);
            clearClub();
          },
        },
      ],
    );
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
    <ScreenBackground>
      <GradientHeader title="Settings" subtitle="Make it yours" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 120 }}>
        <Section title="Account">
          <GradientCard>
            <Text style={styles.body}>{user?.email ?? user?.uid ?? "Not signed in"}</Text>
            {user && <Button title="Sign out" variant="danger" onPress={onSignOut} style={{ marginTop: spacing.md }} />}
          </GradientCard>
        </Section>

        <Section title="My Club">
          <GradientCard>
            {club !== null ? (
              <>
                <View style={styles.clubRow}>
                  <Text style={styles.body}>{club.name}</Text>
                  {role !== null && (
                    <Badge label={role} color={colors.ocean} variant="soft" />
                  )}
                </View>
                {(role === "owner" || role === "admin") && (
                  <Pressable
                    style={({ pressed }) => [styles.settingsRow, pressed && styles.rowPressed]}
                    onPress={() => routerHook.push("/club/admin/index")}
                  >
                    <Text style={styles.settingsRowText}>Club Settings</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </Pressable>
                )}
                <Button title="Leave Club" variant="danger" onPress={onLeaveClub} style={{ marginTop: spacing.md }} />
              </>
            ) : loaded ? (
              <Pressable
                style={({ pressed }) => [styles.settingsRow, pressed && styles.rowPressed]}
                onPress={() => routerHook.push("/club/create")}
              >
                <Text style={styles.settingsRowText}>Join or create a club</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
          </GradientCard>
        </Section>

        <Section title="Units">
          <View style={styles.choices}>
            {(
              [
                { label: "Metric (km)", value: "metric" as Units },
                { label: "Imperial (mi)", value: "imperial" as Units },
              ]
            ).map((o) => (
              <Pill
                key={o.value}
                label={o.label}
                selected={units === o.value}
                onPress={() => void setUnits(o.value)}
              />
            ))}
          </View>
        </Section>

        <Section title="Default craft">
          <View style={styles.choices}>
            {CRAFT_TYPES.map((c) => (
              <Pill
                key={c}
                label={c}
                selected={defaultCraft === c}
                onPress={() => void setDefaultCraft(c as CraftType)}
              />
            ))}
          </View>
        </Section>
      </ScrollView>
    </ScreenBackground>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.ink, fontSize: type.size.md },
  sectionTitle: {
    fontSize: type.size.xs,
    fontWeight: type.weight.heavy,
    letterSpacing: type.spacing.label,
    color: colors.muted,
    textTransform: "uppercase",
    marginLeft: spacing.xs,
  },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  clubRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bgSoft,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    minHeight: 44,
    marginTop: spacing.md,
  },
  rowPressed: { opacity: 0.7 },
  settingsRowText: { color: colors.ink, fontSize: type.size.md },
});
