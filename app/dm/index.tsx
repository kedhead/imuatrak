import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { currentUser } from "@/services/auth";
import { subscribeDmThreads } from "@/services/dmService";
import { useDmUnreadByThread } from "@/services/unread";
import type { DmThread } from "@/models/club";
import { DmThreadRow } from "@/ui/DmThreadRow";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, radii, spacing, type } from "@/ui/theme";

export default function DmListScreen() {
  const user = currentUser();
  const [threads, setThreads] = useState<(DmThread & { id: string })[]>([]);
  const [loaded, setLoaded] = useState(false);
  const unread = useDmUnreadByThread(user?.uid);

  useEffect(() => {
    if (!user) return;
    return subscribeDmThreads(user.uid, (t) => {
      setThreads(t);
      setLoaded(true);
    });
  }, [user?.uid]);

  return (
    <ScreenBackground>
      <FlatList
        data={threads}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.xs }}
        ListHeaderComponent={
          <Pressable style={styles.newBtn} onPress={() => router.push("/dm/new" as never)}>
            <Ionicons name="create-outline" size={18} color={colors.ocean} />
            <Text style={styles.newText}>New message or group</Text>
          </Pressable>
        }
        renderItem={({ item }) => (
          <DmThreadRow
            thread={item}
            myUid={user?.uid}
            unread={unread[item.id] ?? 0}
            onPress={() => router.push(`/dm/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          loaded ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptyText}>
                Tap &ldquo;New&rdquo; to message a teammate or start a group chat for your
                crew.
              </Text>
            </View>
          ) : undefined
        }
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  newText: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ocean },
  emptyWrap: { padding: spacing.xl, alignItems: "center", gap: spacing.sm },
  emptyTitle: { fontSize: type.size.lg, fontWeight: type.weight.bold, color: colors.ink },
  emptyText: { fontSize: type.size.sm, color: colors.muted, textAlign: "center", lineHeight: 20 },
});
