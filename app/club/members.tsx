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
import { clubGrantsAdFree, type ClubMember, type MemberRole } from "@/models/club";
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
    Alert.alert(member.displayName, undefined, [
      {
        text: "Promote to Admin",
        onPress: async () => {
          await updateMemberRole(club.id, member.uid, "admin");
          if (me) await switchClub(club.id, me.uid);
        },
      },
      {
        text: "Make Coach",
        onPress: async () => {
          await updateMemberRole(club.id, member.uid, "coach");
          if (me) await switchClub(club.id, me.uid);
        },
      },
      {
        text: "Remove from Club",
        style: "destructive",
        onPress: async () => {
          await removeMember(club.id, member.uid);
          if (me) await switchClub(club.id, me.uid);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  if (!club) return null;

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <FlatList
        data={sorted}
        keyExtractor={(m) => m.uid}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onLongPress={() => handleLongPress(item)}>
            <Avatar uri={item.avatarUrl} name={item.displayName} uid={item.uid} role={item.role} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.displayName}</Text>
              <Text style={styles.role}>{ROLE_LABEL[item.role]}</Text>
            </View>
            {item.uid === me?.uid ? (
              <Text style={styles.youBadge}>You</Text>
            ) : (
              <Pressable
                hitSlop={10}
                style={styles.dmBtn}
                disabled={openingUid === item.uid}
                onPress={() => handleMessage(item)}
              >
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={20}
                  color={openingUid === item.uid ? colors.muted : colors.ocean}
                />
              </Pressable>
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
  youBadge: { fontSize: 12, fontWeight: "700", color: colors.blue, backgroundColor: "#EBF3FB", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  hint: { textAlign: "center", color: colors.muted, fontSize: 13, marginTop: spacing.xl },
});
