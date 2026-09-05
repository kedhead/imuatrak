import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  clubGrantsAdFree,
  formatBirthday,
  isBirthdayToday,
  paddleSideLabel,
  type MemberRole,
} from "@/models/club";
import { currentUser } from "@/services/auth";
import { useClub } from "@/services/clubStore";
import { openDmThread } from "@/services/dmService";
import { useSubscription } from "@/services/subscriptionStore";
import { Avatar } from "@/ui/Avatar";
import { colors, radii, spacing, type } from "@/ui/theme";

const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  coach: "Coach",
  member: "Member",
};
const ROLE_COLOR: Record<MemberRole, string> = {
  owner: colors.gold,
  admin: colors.coral,
  coach: colors.teal,
  member: colors.muted,
};

/**
 * A club member's profile, opened by tapping their name in the roster.
 *
 * Reads straight from the club store's roster rather than fetching: the list
 * that linked here is already loaded, so the profile opens instantly and stays
 * in sync when the roster reloads.
 */
export default function MemberProfileScreen() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const club = useClub((s) => s.club);
  const members = useClub((s) => s.members);
  const member = members.find((m) => m.uid === uid);

  const me = currentUser();
  const isAdFree = useSubscription((s) => s.isAdFree);
  const isSubscriber = isAdFree || clubGrantsAdFree(club);
  const insets = useSafeAreaInsets();
  const [photoOpen, setPhotoOpen] = useState(false);
  const [opening, setOpening] = useState(false);

  if (!member) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.center}>
          <Text style={styles.muted}>This paddler is no longer in the club.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isMe = member.uid === me?.uid;
  const side = paddleSideLabel(member.paddleSide);
  const birthday = formatBirthday(member.birthday);
  const joined = member.joinedAt
    ? new Date(member.joinedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : null;

  // Same gate as the roster: starting a conversation is the paid half of DMs.
  const handleMessage = async () => {
    if (!me || opening) return;
    if (!isSubscriber) {
      router.push("/paywall");
      return;
    }
    setOpening(true);
    try {
      const threadId = await openDmThread(member.uid);
      router.push(`/dm/${threadId}`);
    } catch {
      Alert.alert("Couldn't open chat", "Please try again.");
    } finally {
      setOpening(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Tapping the photo opens it full-screen; initials aren't worth
            enlarging, so only a real photo is tappable. */}
        <Pressable
          onPress={() => member.avatarUrl && setPhotoOpen(true)}
          disabled={!member.avatarUrl}
          style={styles.avatarWrap}
        >
          <Avatar
            uri={member.avatarUrl}
            name={member.displayName}
            uid={member.uid}
            role={member.role}
            size={132}
          />
          {!!member.avatarUrl && (
            <View style={styles.expandBadge}>
              <Ionicons name="expand" size={14} color={colors.white} />
            </View>
          )}
        </Pressable>

        <Text style={styles.name}>
          {member.displayName}
          {isBirthdayToday(member.birthday) ? "  🎂" : ""}
        </Text>
        <View style={[styles.roleChip, { backgroundColor: ROLE_COLOR[member.role] }]}>
          <Text style={styles.roleChipText}>{ROLE_LABEL[member.role].toUpperCase()}</Text>
        </View>

        <View style={styles.card}>
          <InfoRow icon="swap-horizontal-outline" label="Paddling side" value={side ?? "Not set"} />
          <InfoRow icon="gift-outline" label="Birthday" value={birthday ?? "Not set"} />
          {joined && <InfoRow icon="calendar-outline" label="Joined" value={joined} />}
        </View>

        {!isMe && (
          <Pressable style={styles.messageBtn} onPress={handleMessage} disabled={opening}>
            {opening ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.white} />
            )}
            <Text style={styles.messageBtnText}>Message</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Full-size profile photo */}
      {photoOpen && !!member.avatarUrl && (
        <Modal visible animationType="fade" onRequestClose={() => setPhotoOpen(false)} statusBarTranslucent>
          <Pressable style={styles.photoBg} onPress={() => setPhotoOpen(false)}>
            <Image
              source={{ uri: member.avatarUrl }}
              style={styles.photoFull}
              resizeMode="contain"
            />
          </Pressable>
          <Pressable
            style={[styles.photoClose, { top: Math.max(insets.top, spacing.sm) }]}
            onPress={() => setPhotoOpen(false)}
            hitSlop={16}
          >
            <Ionicons name="close" size={28} color={colors.white} />
          </Pressable>
        </Modal>
      )}
    </SafeAreaView>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={colors.ocean} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  muted: { color: colors.muted, fontSize: type.size.md },
  content: { padding: spacing.lg, alignItems: "center", gap: spacing.sm, paddingBottom: 60 },
  avatarWrap: { position: "relative" },
  expandBadge: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.bg,
  },
  name: {
    fontSize: type.size.xl,
    fontWeight: type.weight.heavy,
    color: colors.ink,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  roleChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  roleChipText: {
    fontSize: type.size.xs,
    fontWeight: type.weight.heavy,
    color: colors.white,
    letterSpacing: 0.8,
  },
  card: {
    alignSelf: "stretch",
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  infoLabel: { flex: 1, fontSize: type.size.md, color: colors.muted },
  infoValue: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink },
  messageBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    alignSelf: "stretch",
    backgroundColor: colors.ocean,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
  },
  messageBtnText: { color: colors.white, fontSize: type.size.md, fontWeight: type.weight.bold },
  photoBg: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  photoFull: { width: "100%", height: "100%" },
  photoClose: {
    position: "absolute",
    right: spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
});
