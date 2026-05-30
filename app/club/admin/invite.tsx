import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useClub } from "@/services/clubStore";
import { createInviteToken } from "@/services/clubService";
import { Button } from "@/ui/Button";
import { GradientCard } from "@/ui/GradientCard";
import { colors, spacing, type } from "@/ui/theme";

export default function InviteScreen() {
  const club = useClub((s) => s.club);
  const [loading, setLoading] = useState(false);
  const [lastToken, setLastToken] = useState<string | null>(null);

  if (!club) return null;

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const token = await createInviteToken(club.id);
      setLastToken(token);
      await Share.share({
        message: `Join ${club.name} on ImuaTrak!\n\nUse invite code: ${token}\n\nDownload the app at imuatrak.app`,
      });
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to generate invite link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.content}>
        <GradientCard>
          <View style={styles.iconWrap}>
            <Ionicons name="link" size={32} color={colors.aqua} />
          </View>
          <Text style={styles.title}>Invite members</Text>
          <Text style={styles.body}>
            Generate a one-time invite code that lets anyone download ImuaTrak and join{" "}
            <Text style={{ fontWeight: type.weight.bold }}>{club.name}</Text>. Codes expire after 7 days.
          </Text>

          {lastToken && (
            <View style={styles.tokenBox}>
              <Text style={styles.tokenLabel}>LAST GENERATED CODE</Text>
              <Text style={styles.token}>{lastToken}</Text>
            </View>
          )}
        </GradientCard>

        <Button
          title={loading ? "Generating…" : "Generate & share invite"}
          gradient="aqua"
          glow
          disabled={loading}
          onPress={handleGenerate}
          style={{ marginTop: spacing.lg }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSoft },
  content: { padding: spacing.lg, gap: spacing.md },
  iconWrap: { alignItems: "center", marginBottom: spacing.sm },
  title: { fontSize: type.size.xl, fontWeight: type.weight.heavy, color: colors.ink, textAlign: "center" },
  body: { fontSize: type.size.md, color: colors.muted, textAlign: "center", lineHeight: 22, marginTop: spacing.sm },
  tokenBox: { marginTop: spacing.md, backgroundColor: colors.bg, borderRadius: 8, padding: spacing.md, alignItems: "center" },
  tokenLabel: { fontSize: type.size.xs, fontWeight: type.weight.heavy, color: colors.muted, letterSpacing: 1.2 },
  token: { fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.ink, marginTop: spacing.xs, letterSpacing: 2, ...type.mono },
});
