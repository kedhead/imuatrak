import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { waitForAuth } from "@/services/auth";
import { setPendingInvite } from "@/services/pendingInvite";
import { extractInviteIdentifier, looksLikeInvite } from "@/services/invite";
import { resolveInviteToken, joinClub, getClub, getClubBySlug } from "@/services/clubService";
import { useClub } from "@/services/clubStore";
import { colors, radii, spacing, type } from "@/ui/theme";

/** Loaded on demand — see openScanner below. Type-only, so expo-camera is not
 *  pulled into this screen's bundle. */
type ScannerModule = typeof import("@/ui/QrScanner");

export default function JoinClubScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slug?: string; code?: string }>();
  // Full reload rather than switchClub: joining adds a membership, so the
  // switcher's club list has to be refetched too, not just the active club.
  const loadClubs = useClub((s) => s.load);
  const [input, setInput] = useState(params.code ?? "");
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [Scanner, setScanner] = useState<ScannerModule | null>(null);
  // A deep link can re-render this screen; without the latch the auto-join
  // would fire twice and the second attempt would report "already a member".
  const autoJoined = useRef(false);
  const prefilled = useRef(false);

  /**
   * Where to go once the join is done. A link tapped from a killed app opens
   * this screen with nothing beneath it, so router.back() had nowhere to go
   * and left the new member staring at the Join Club form.
   */
  const leaveJoinScreen = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/club");
  }, [router]);

  const handleJoinWithIdentifier = useCallback(async (identifier: string) => {
    // Wait for Firebase to restore the persisted session before deciding
    // whether anyone is signed in. Reading currentUser() directly here is what
    // made invite links fail from a cold start: the app opened straight onto
    // this screen and demanded a sign-in the user had already done.
    const user = await waitForAuth();
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
          "This link or code may be invalid or expired. Ask your club for a new one.",
        );
        return;
      }
      // The profile write can still be in flight right after email sign-up —
      // prefer the email prefix over the literal "Member" if the name hasn't
      // landed yet. The reload below self-heals the doc once it has.
      const displayName =
        user.displayName?.trim() || user.email?.split("@")[0] || "Member";
      const result = await joinClub(club.id, user.uid, displayName);
      // joinClub points userClubs.activeClubId at the new club, so a reload
      // lands on it and picks up the added membership.
      await loadClubs(user.uid);
      Alert.alert(
        result === "already-a-member" ? "You're already in" : "Joined!",
        result === "already-a-member"
          ? `${club.name} is already one of your clubs.`
          : `Welcome to ${club.name}!`,
        [{ text: "Let's go", onPress: leaveJoinScreen }],
      );
    } catch (e) {
      // Surface the real reason. The old blanket message hid permission and
      // network errors behind "please try again", which is why a failing
      // invite was impossible to tell apart from a wrong code.
      Alert.alert("Couldn't join", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }, [loadClubs, router, leaveJoinScreen]);

  // Auto-join when opened via deep link with a slug/id param. Otherwise,
  // pre-fill from the clipboard — the "get the app" flow on the web invite
  // page copies the link, so a fresh install lands here with it ready.
  useEffect(() => {
    if (params.slug) {
      if (autoJoined.current) return;
      autoJoined.current = true;
      const identifier = extractInviteIdentifier(params.slug) ?? params.slug;
      setInput(identifier);
      void handleJoinWithIdentifier(identifier);
      return;
    }
    if (!params.code && !prefilled.current) {
      prefilled.current = true;
      void (async () => {
        try {
          const clip = (await Clipboard.getStringAsync()).trim();
          // Only fill an untouched field — a re-run must never overwrite what
          // the user is in the middle of typing.
          if (looksLikeInvite(clip)) {
            setInput((current) => current || extractInviteIdentifier(clip) || clip);
          }
        } catch {
          // Clipboard access denied — nothing to prefill.
        }
      })();
    }
  }, [params.slug, params.code, handleJoinWithIdentifier]);

  const handleSubmit = async () => {
    const raw = input.trim();
    if (!raw) { Alert.alert("Enter an invite code or paste a link"); return; }
    const identifier = extractInviteIdentifier(raw);
    if (!identifier) {
      Alert.alert(
        "That doesn't look like an invite",
        "Paste the full imuatrak.app/join link, or type just the invite code.",
      );
      return;
    }
    await handleJoinWithIdentifier(identifier);
  };

  /**
   * Open the scanner, loading expo-camera on demand. The dynamic import keeps
   * binaries built before the camera module shipped from crashing at bundle
   * load — they get an upgrade prompt instead, same as GPX import.
   */
  const openScanner = async () => {
    if (!Scanner) {
      try {
        const mod = await import("@/ui/QrScanner");
        setScanner(mod);
      } catch {
        Alert.alert(
          "Update required",
          "QR scanning needs the newest version of ImuaTrak. Update from the store, or paste the invite link instead.",
        );
        return;
      }
    }
    setScanning(true);
  };

  const onScanned = (data: string) => {
    setScanning(false);
    const identifier = extractInviteIdentifier(data);
    if (!identifier) {
      Alert.alert(
        "Not an ImuaTrak invite",
        "That QR code doesn't point at a club. Ask for the club's invite QR from Club → Invite.",
      );
      return;
    }
    setInput(identifier);
    void handleJoinWithIdentifier(identifier);
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >
        <View style={styles.content}>
          <Text style={styles.title}>Join a club</Text>
          <Text style={styles.subtitle}>
            Scan the club&apos;s QR code, paste the invite link, or type the invite code.
          </Text>

          <Pressable
            style={({ pressed }) => [styles.scanBtn, pressed && { opacity: 0.7 }]}
            onPress={() => void openScanner()}
            disabled={loading}
          >
            <Ionicons name="qr-code-outline" size={20} color={colors.ocean} />
            <Text style={styles.scanBtnText}>Scan QR code</Text>
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TextInput
            style={styles.input}
            placeholder="Link or invite code"
            placeholderTextColor={colors.muted}
            value={input}
            onChangeText={setInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="join"
            onSubmitEditing={() => void handleSubmit()}
          />
          <Pressable
            style={[styles.btn, (loading || !input.trim()) && { opacity: 0.5 }]}
            onPress={() => void handleSubmit()}
            disabled={loading || !input.trim()}
          >
            {loading
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.btnText}>Join Club</Text>
            }
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {scanning && Scanner && (
        <Modal visible animationType="slide" onRequestClose={() => setScanning(false)}>
          <Scanner.QrScanner onScanned={onScanned} onCancel={() => setScanning(false)} />
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSoft },
  content: { padding: spacing.xl, gap: spacing.md },
  title: { fontSize: type.size.xxl, fontWeight: type.weight.heavy, color: colors.ink },
  subtitle: { fontSize: type.size.md, color: colors.muted, lineHeight: 22 },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.md + 2,
    marginTop: spacing.md,
  },
  scanBtnText: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ocean },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.line },
  dividerText: { fontSize: type.size.xs, color: colors.muted, textTransform: "uppercase" },
  input: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: type.size.md,
    color: colors.ink,
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
