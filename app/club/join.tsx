import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
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
import * as Clipboard from "expo-clipboard";
import { currentUser } from "@/services/auth";
import { setPendingInvite } from "@/services/pendingInvite";
import { resolveInviteToken, joinClub, getClub, getClubBySlug } from "@/services/clubService";
import { useClub } from "@/services/clubStore";
import { colors, radii, spacing, type } from "@/ui/theme";

function extractIdentifier(raw: string): string | null {
  // Full URL: https://imuatrak.app/join/{clubId-or-slug}
  const match = raw.match(/imuatrak\.app\/join\/([a-z0-9-]+)/i);
  if (match) return match[1] ?? null;
  // Bare club ID (Firestore auto-ID, alphanumeric) or slug (with hyphens)
  if (/^[a-z0-9-]{2,60}$/i.test(raw)) return raw;
  return null;
}

export default function JoinClubScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slug?: string; code?: string }>();
  const switchClub = useClub((s) => s.switchClub);
  const [input, setInput] = useState(params.code ?? "");
  const [loading, setLoading] = useState(false);

  // Auto-join when opened via deep link with a slug/id param. Otherwise,
  // pre-fill from the clipboard — the "get the app" flow on the web invite
  // page copies the link, so a fresh install lands here with it ready.
  useEffect(() => {
    if (params.slug) {
      setInput(params.slug);
      void handleJoinWithIdentifier(params.slug);
      return;
    }
    if (!params.code) {
      void (async () => {
        try {
          const clip = (await Clipboard.getStringAsync()).trim();
          if (extractIdentifier(clip) && clip.includes("imuatrak.app/join")) {
            setInput(clip);
          }
        } catch {
          // Clipboard access denied — nothing to prefill.
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleJoinWithIdentifier = async (identifier: string) => {
    const user = currentUser();
    if (!user) {
      // Keep the invite so the join resumes automatically after sign-in —
      // the invitee shouldn't have to dig the link out of their chat again.
      await setPendingInvite(identifier);
      Alert.alert(
        "Sign in to join",
        "Create an account or sign in — we'll bring you right back to this invite.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Sign in", onPress: () => router.push("/onboarding") },
        ],
      );
      return;
    }
    setLoading(true);
    try {
      // Resolve in order: club document ID (current links) → slug (legacy
      // links) → one-time invite token (12-char hex code).
      const lower = identifier.toLowerCase();
      let club =
        (await getClub(identifier)) ?? (await getClubBySlug(lower));
      if (!club) {
        const clubId = await resolveInviteToken(lower);
        if (clubId) club = await getClub(clubId);
      }
      if (!club) {
        Alert.alert(
          "Club not found",
          "This link or code may be invalid or expired. Ask your admin for a new one.",
        );
        return;
      }
      await joinClub(club.id, user.uid, user.displayName ?? "Member");
      await switchClub(club.id, user.uid);
      Alert.alert("Joined!", `Welcome to ${club.name}!`, [
        { text: "Let's go", onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert("Error", "Failed to join. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    const raw = input.trim();
    if (!raw) { Alert.alert("Enter an invite code or paste a link"); return; }
    // extractIdentifier strips a full URL down to the id/slug; otherwise the
    // raw text (id, slug, or one-time code) is resolved directly.
    await handleJoinWithIdentifier(extractIdentifier(raw) ?? raw);
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Join a club</Text>
          <Text style={styles.subtitle}>
            Paste the invite link your admin shared, or type the invite code.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Link or invite code"
            placeholderTextColor={colors.muted}
            value={input}
            onChangeText={setInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="join"
            onSubmitEditing={handleSubmit}
          />
          <Pressable
            style={[styles.btn, (loading || !input.trim()) && { opacity: 0.5 }]}
            onPress={handleSubmit}
            disabled={loading || !input.trim()}
          >
            {loading
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.btnText}>Join Club</Text>
            }
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSoft },
  content: { padding: spacing.xl, gap: spacing.md },
  title: { fontSize: type.size.xxl, fontWeight: type.weight.heavy, color: colors.ink },
  subtitle: { fontSize: type.size.md, color: colors.muted, lineHeight: 22 },
  input: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: type.size.md,
    color: colors.ink,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  btn: {
    backgroundColor: colors.ocean,
    borderRadius: radii.pill,
    paddingVertical: spacing.md + 2,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  btnText: { color: colors.white, fontWeight: type.weight.bold, fontSize: type.size.lg },
});
