import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { currentUser } from "@/services/auth";
import { useClub } from "@/services/clubStore";
import { colors, radii, spacing, type } from "@/ui/theme";

/**
 * Bottom sheet listing every club the paddler belongs to, with actions to
 * join or create another. Membership has always been multi-club in the data
 * model (userClubs.clubIds is an array); this is the UI that makes the extra
 * memberships reachable instead of stranding the user on whichever club
 * happens to be active.
 */
export function ClubSwitcher({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const myClubs = useClub((s) => s.myClubs);
  const activeId = useClub((s) => s.club?.id);
  const setActiveClub = useClub((s) => s.setActiveClub);
  const [switching, setSwitching] = useState<string | null>(null);

  const onPick = async (clubId: string) => {
    const uid = currentUser()?.uid;
    if (!uid || clubId === activeId) {
      onClose();
      return;
    }
    setSwitching(clubId);
    try {
      await setActiveClub(clubId, uid);
      onClose();
    } finally {
      setSwitching(null);
    }
  };

  const go = (path: string) => {
    onClose();
    router.push(path as never);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Your clubs</Text>
          <ScrollView style={styles.list}>
            {myClubs.map((c) => {
              const active = c.id === activeId;
              return (
                <Pressable
                  key={c.id}
                  style={[styles.row, active && styles.rowActive]}
                  onPress={() => void onPick(c.id)}
                  disabled={switching !== null}
                >
                  <View style={[styles.avatar, active && { backgroundColor: colors.ocean }]}>
                    <Text style={styles.avatarText}>{(c.name[0] ?? "?").toUpperCase()}</Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowName} numberOfLines={1}>{c.name}</Text>
                    {c.location?.city ? (
                      <Text style={styles.rowMeta} numberOfLines={1}>{c.location.city}</Text>
                    ) : null}
                  </View>
                  {switching === c.id ? (
                    <ActivityIndicator color={colors.ocean} />
                  ) : active ? (
                    <Ionicons name="checkmark-circle" size={22} color={colors.ocean} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable style={styles.action} onPress={() => go("/club/join")}>
            <Ionicons name="enter-outline" size={20} color={colors.ocean} />
            <Text style={styles.actionText}>Join another club</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={() => go("/club/create")}>
            <Ionicons name="add-circle-outline" size={20} color={colors.ocean} />
            <Text style={styles.actionText}>Create a club</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    maxHeight: "75%",
  },
  title: { fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.ink, marginBottom: spacing.md },
  list: { flexGrow: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  rowActive: { backgroundColor: "rgba(7,49,79,0.06)" },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.aqua, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.white, fontWeight: type.weight.heavy, fontSize: type.size.md },
  rowText: { flex: 1 },
  rowName: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink },
  rowMeta: { fontSize: type.size.xs, color: colors.muted, marginTop: 1 },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  actionText: { fontSize: type.size.md, color: colors.ocean, fontWeight: type.weight.bold },
});
