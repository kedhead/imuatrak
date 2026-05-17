import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { currentUser } from "@/services/auth";
import { resolveInviteToken, joinClub, getClub } from "@/services/clubService";
import { useClub } from "@/services/clubStore";
import { colors, spacing, radii } from "@/ui/theme";

export default function JoinClubScreen() {
  const router = useRouter();
  const switchClub = useClub((s) => s.switchClub);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    const code = token.trim().toUpperCase();
    if (!code) {
      Alert.alert("Enter an invite code");
      return;
    }
    const user = currentUser();
    if (!user) {
      Alert.alert("Please sign in first");
      return;
    }
    setLoading(true);
    try {
      const clubId = await resolveInviteToken(code);
      if (!clubId) {
        Alert.alert("Invalid or expired invite code", "Ask your club admin for a new invite link.");
        return;
      }
      const club = await getClub(clubId);
      if (!club) {
        Alert.alert("Club not found");
        return;
      }
      await joinClub(clubId, user.uid, user.displayName ?? "Member");
      await switchClub(clubId, user.uid);
      Alert.alert("Joined!", `Welcome to ${club.name}!`, [
        { text: "Let's go", onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert("Error", "Failed to join. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Enter your invite code</Text>
          <Text style={styles.subtitle}>
            Ask your club admin to generate an invite code from the Club Settings screen.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. ABC123DEF456"
            placeholderTextColor={colors.muted}
            value={token}
            onChangeText={setToken}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="join"
            onSubmitEditing={handleJoin}
          />
          <Pressable
            style={[styles.btn, loading && { opacity: 0.6 }]}
            onPress={handleJoin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Join Club</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, gap: spacing.md },
  title: { fontSize: 24, fontWeight: "800", color: colors.ink },
  subtitle: { fontSize: 15, color: colors.muted, lineHeight: 22 },
  input: { backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.md, fontSize: 20, color: colors.ink, fontWeight: "700", letterSpacing: 2, textAlign: "center", marginTop: spacing.lg },
  btn: { backgroundColor: colors.blue, borderRadius: radii.md, paddingVertical: spacing.md + 2, alignItems: "center", marginTop: spacing.sm },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 17 },
});
