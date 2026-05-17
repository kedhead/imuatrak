import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { currentUser } from "@/services/auth";
import { removeMember, updateMemberRole, leaveClub } from "@/services/clubService";
import { useClub } from "@/services/clubStore";
import type { ClubMember, MemberRole } from "@/models/club";
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
  const [loading, setLoading] = useState(false);

  const sorted = [...members].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
  );

  const isAdmin = role === "owner" || role === "admin";
  const me = currentUser();

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
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.displayName.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.displayName}</Text>
              <Text style={styles.role}>{ROLE_LABEL[item.role]}</Text>
            </View>
            {item.uid === me?.uid && (
              <Text style={styles.youBadge}>You</Text>
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
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.blue, justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 18 },
  name: { fontSize: 16, fontWeight: "600", color: colors.ink },
  role: { fontSize: 13, color: colors.muted, marginTop: 2 },
  youBadge: { fontSize: 12, fontWeight: "700", color: colors.blue, backgroundColor: "#EBF3FB", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  hint: { textAlign: "center", color: colors.muted, fontSize: 13, marginTop: spacing.xl },
});
