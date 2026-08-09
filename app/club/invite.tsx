import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { useClub } from "@/services/clubStore";
import { createInviteToken } from "@/services/clubService";
import { inviteLink, inviteShareMessage } from "@/services/invite";
import { Button } from "@/ui/Button";
import { GradientCard } from "@/ui/GradientCard";
import { colors, radii, spacing, type } from "@/ui/theme";

/**
 * Invite screen. Open to EVERY member of the club, not just staff: growing the
 * club is something paddlers do at the beach, and the permanent link is a
 * public capability anyway (the club doc is world-readable so the web landing
 * page can render it, and joining always requires the invitee to sign in).
 *
 * The one-time expiring code stays owner/admin-only — it is minted by the
 * createClubInvite Cloud Function, which enforces the same rule server-side.
 */
export default function InviteScreen() {
  const club = useClub((s) => s.club);
  const role = useClub((s) => s.role);
  const isStaff = role === "owner" || role === "admin";
  const [generatingToken, setGeneratingToken] = useState(false);
  const [lastToken, setLastToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!club) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No club selected.</Text>
      </View>
    );
  }

  // Use the club's unique document ID (not the slug) so the link is always
  // specific to this club and never stale — slugs can collide or go out of
  // date if the club is renamed.
  const permanentLink = inviteLink(club.id);

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(permanentLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      Alert.alert("Couldn't copy", "Copy the link from the box above instead.");
    }
  };

  const handleShare = async () => {
    try {
      // Message only, no separate `url`: iOS hands both to the share sheet as
      // two activity items and several targets (Mail, Twitter, some keyboards)
      // keep one and silently drop the other — which is how invites went out
      // with the explanation but no link, or the link with no context.
      await Share.share(
        { message: inviteShareMessage(club.name, permanentLink) },
        { dialogTitle: `Invite people to ${club.name}` },
      );
    } catch (e) {
      Alert.alert("Couldn't open the share sheet", e instanceof Error ? e.message : "Try copying the link instead.");
    }
  };

  const handleGenerateToken = async () => {
    setGeneratingToken(true);
    try {
      const token = await createInviteToken(club.id);
      setLastToken(token);
      await Share.share({
        message: `Join ${club.name} on ImuaTrak!\n\nInvite code: ${token}\n\nDownload the app at imuatrak.app`,
      });
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to generate invite code");
    } finally {
      setGeneratingToken(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Permanent link */}
        <Text style={styles.sectionLabel}>Club Link</Text>
        <GradientCard>
          <Text style={styles.cardTitle}>Permanent invite link</Text>
          <Text style={styles.cardBody}>
            Share this link anytime — it never expires. Anyone who opens it can join{" "}
            <Text style={{ fontWeight: type.weight.bold }}>{club.name}</Text>.
          </Text>
          <View style={styles.linkBox}>
            <Text style={styles.linkText} numberOfLines={1} ellipsizeMode="middle">
              {permanentLink}
            </Text>
          </View>
          <View style={styles.linkActions}>
            <Pressable
              onPress={() => void handleCopy()}
              style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons
                name={copied ? "checkmark-circle" : "copy-outline"}
                size={18}
                color={copied ? colors.teal : colors.ocean}
              />
              <Text style={[styles.actionText, copied && { color: colors.teal }]}>
                {copied ? "Copied!" : "Copy"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void handleShare()}
              style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="share-outline" size={18} color={colors.ocean} />
              <Text style={styles.actionText}>Share</Text>
            </Pressable>
          </View>
        </GradientCard>

        {/* QR Code */}
        <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>QR Code</Text>
        <GradientCard>
          <Text style={styles.cardTitle}>Scan to join</Text>
          <Text style={styles.cardBody}>
            Show this at practice — members scan it with their phone camera to join instantly.
          </Text>
          <View style={styles.qrWrap}>
            <QRCode
              value={permanentLink}
              size={200}
              color={colors.oceanDeep}
              backgroundColor={colors.white}
            />
          </View>
        </GradientCard>

        {/* One-time code (staff only) */}
        {isStaff && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>One-Time Code</Text>
            <GradientCard>
              <Text style={styles.cardTitle}>Expiring invite code</Text>
              <Text style={styles.cardBody}>
                Generates a single-use code valid for 7 days. Useful when you want a link that expires.
              </Text>
              {lastToken && (
                <View style={styles.tokenBox}>
                  <Text style={styles.tokenLabel}>LAST CODE</Text>
                  <Text style={styles.tokenText}>{lastToken}</Text>
                </View>
              )}
              <Button
                title={generatingToken ? "Generating…" : "Generate & share code"}
                variant="outline"
                disabled={generatingToken}
                onPress={() => void handleGenerateToken()}
                style={{ marginTop: spacing.md }}
              />
            </GradientCard>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgSoft },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 60 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bgSoft },
  emptyText: { color: colors.muted, fontSize: type.size.md },
  sectionLabel: {
    fontSize: type.size.xs,
    fontWeight: type.weight.heavy,
    letterSpacing: type.spacing.label,
    color: colors.muted,
    textTransform: "uppercase",
    marginLeft: spacing.xs,
    marginBottom: spacing.sm,
  },
  cardTitle: { fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.ink },
  cardBody: { fontSize: type.size.sm, color: colors.muted, lineHeight: 20, marginTop: spacing.xs },
  linkBox: {
    backgroundColor: colors.bgSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  linkText: { fontSize: type.size.sm, color: colors.ocean, fontWeight: type.weight.bold },
  linkActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  actionText: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.ocean },
  qrWrap: { alignItems: "center", marginTop: spacing.lg, padding: spacing.md },
  tokenBox: {
    backgroundColor: colors.bgSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  tokenLabel: { fontSize: type.size.xs, fontWeight: type.weight.heavy, color: colors.muted, letterSpacing: 1.2 },
  tokenText: { fontSize: type.size.xl, fontWeight: type.weight.heavy, color: colors.ink, marginTop: spacing.xs, letterSpacing: 2, ...type.mono },
});
