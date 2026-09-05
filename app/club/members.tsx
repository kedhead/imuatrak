import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { currentUser } from "@/services/auth";
import { removeMember, updateMemberRole } from "@/services/clubService";
import { openDmThread } from "@/services/dmService";
import { useClub } from "@/services/clubStore";
import { useSubscription } from "@/services/subscriptionStore";
import { useDmUnreadByThread } from "@/services/unread";
import {
  clubGrantsAdFree,
  dmThreadId,
  isBirthdayToday,
  paddleSideLabel,
  type ClubMember,
  type MemberRole,
} from "@/models/club";
import { Avatar } from "@/ui/Avatar";
import { colors, spacing, radii } from "@/ui/theme";

const ROLE_ORDER: MemberRole[] = ["owner", "admin", "coach", "member"];
const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  coach: "Coach",
  member: "Member",
};

export default function MembersScreen() {
  const club = useClub((s) => s.club);
  const role = useClub((s) => s.role);
  const members = useClub((s) => s.members);
  const switchClub = useClub((s) => s.switchClub);
  const sorted = [...members].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
  );

  const me = currentUser();
  const isAdmin = role === "owner" || role === "admin";
  // "Paid" means the same thing here as everywhere else in the app: your own
  // ImuaTrak+ subscription, OR membership of a club on an active/unexpired
  // trial plan. Checking only the personal entitlement sent members of a
  // paying club to the paywall for a feature their club had already bought.
  const isAdFree = useSubscription((s) => s.isAdFree);
  const isSubscriber = isAdFree || clubGrantsAdFree(club);
  const [openingUid, setOpeningUid] = useState<string | null>(null);
  // Which members have unread DMs. The thread id is derived from the uid pair,
  // so this needs no extra reads — otherwise you'd have to open every
  // conversation to find the one that changed.
  const dmUnreadByThread = useDmUnreadByThread(me?.uid);

  /**
   * Open (or create) a private thread with this member.
   *
   * Starting a conversation is the paid half of DMs — replying to one is
   * always free, so a subscriber's message never lands somewhere the
   * recipient can't answer. Opening an existing thread stays free for the
   * same reason: once someone has messaged you, you can keep talking.
   */
  const handleMessage = async (member: ClubMember) => {
    if (!me || openingUid) return;
    if (!isSubscriber) {
      router.push("/paywall");
      return;
    }
    setOpeningUid(member.uid);
    try {
      const threadId = await openDmThread(member.uid);
      router.push(`/dm/${threadId}`);
    } catch {
      Alert.alert("Couldn't open chat", "Please try again.");
    } finally {
      setOpeningUid(null);
    }
  };

  const handleLongPress = (member: ClubMember) => {
    if (!isAdmin || !club || member.uid === me?.uid) return;

    // The owner is the club's root authority and can't be demoted or removed
    // from here — that's a transfer-ownership flow, not a role change.
    if (member.role === "owner") return;

    // Only the owner may change another admin's role. Without this, any admin
    // could demote or remove a peer admin (or, before the owner guard above,
    // even the owner). Admins keep managing coaches and members.
    const canManageAdmins = role === "owner";
    if (member.role === "admin" && !canManageAdmins) {
      Alert.alert("Owner only", "Only the club owner can change an admin's role.");
      return;
    }

    const setRole = (next: MemberRole) => async () => {
      await updateMemberRole(club.id, member.uid, next);
      if (me) await switchClub(club.id, me.uid);
    };

    // Build the menu from the member's current role so the current role is
    // never offered and demotion is available for admins/coaches.
    const options: { text: string; style?: "destructive" | "cancel"; onPress?: () => void }[] = [];
    if (member.role !== "admin") options.push({ text: "Promote to Admin", onPress: setRole("admin") });
    if (member.role !== "coach") options.push({ text: "Make Coach", onPress: setRole("coach") });
    if (member.role !== "member") options.push({ text: "Demote to Member", onPress: setRole("member") });
    options.push({
      text: "Remove from Club",
      style: "destructive",
      onPress: async () => {
        await removeMember(club.id, member.uid);
        if (me) await switchClub(club.id, me.uid);
      },
    });
    options.push({ text: "Cancel", style: "cancel" });

    Alert.alert(member.displayName, `Change ${ROLE_LABEL[member.role]} role`, options);
  };

  if (!club) return null;

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <FlatList
        data={sorted}
        keyExtractor={(m) => m.uid}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => router.push(`/club/member/${item.uid}` as never)}
            onLongPress={() => handleLongPress(item)}
          >
            <Avatar uri={item.avatarUrl} name={item.displayName} uid={item.uid} role={item.role} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {item.displayName}
                {isBirthdayToday(item.birthday) ? "  🎂" : ""}
              </Text>
              <Text style={styles.role}>
                {ROLE_LABEL[item.role]}
                {paddleSideLabel(item.paddleSide) ? ` · ${paddleSideLabel(item.paddleSide)} side` : ""}
              </Text>
            </View>
            {item.uid === me?.uid ? (
              <Text style={styles.youBadge}>You</Text>
            ) : (
              (() => {
                const unread = me ? (dmUnreadByThread[dmThreadId(me.uid, item.uid)] ?? 0) : 0;
                return (
                  <Pressable
                    hitSlop={10}
                    style={styles.dmBtn}
                    disabled={openingUid === item.uid}
                    onPress={() => handleMessage(item)}
                  >
                    <Ionicons
                      name={unread > 0 ? "chatbubble-ellipses" : "chatbubble-ellipses-outline"}
                      size={20}
                      color={
                        openingUid === item.uid
                          ? colors.muted
                          : unread > 0
                            ? colors.coral
                            : colors.ocean
                      }
                    />
                    {unread > 0 && (
                      <View style={styles.dmBadge}>
                        <Text style={styles.dmBadgeText}>{unread > 9 ? "9+" : unread}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })()
            )}
          </Pressable>
        )}
        ListFooterComponent={
          <Text style={styles.hint}>
            {isAdmin ? "Long-press a member to change their role." : ""}
          </Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.md, gap: spacing.md },
  name: { fontSize: 16, fontWeight: "600", color: colors.ink },
  role: { fontSize: 13, color: colors.muted, marginTop: 2 },
  dmBtn: { padding: spacing.xs },
  dmBadge: {
    position: "absolute",
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.coral,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  dmBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  youBadge: { fontSize: 12, fontWeight: "700", color: colors.blue, backgroundColor: "#EBF3FB", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  hint: { textAlign: "center", color: colors.muted, fontSize: 13, marginTop: spacing.xl },
});
