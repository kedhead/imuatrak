import { router } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { currentUser } from "@/services/auth";
import { subscribeDmThreads } from "@/services/dmService";
import type { DmThread } from "@/models/club";
import { Avatar } from "@/ui/Avatar";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, radii, spacing, type } from "@/ui/theme";

export default function DmListScreen() {
  const user = currentUser();
  const [threads, setThreads] = useState<(DmThread & { id: string })[]>([]);
  const [loaded, setLoaded] = useState(false);

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
        renderItem={({ item }) => {
          const otherUid = item.participants.find((p) => p !== user?.uid) ?? "";
          const name = item.participantNames?.[otherUid] ?? "Member";
          return (
            <Pressable
              style={styles.row}
              onPress={() => router.push(`/dm/${item.id}`)}
            >
              <Avatar
                uri={item.participantAvatars?.[otherUid]}
                name={name}
                uid={otherUid}
                size={44}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{name}</Text>
                <Text style={styles.preview} numberOfLines={1}>
                  {item.lastMessagePreview ?? "No messages yet"}
                </Text>
              </View>
              {!!item.lastMessageAt && (
                <Text style={styles.when}>
                  {new Date(item.lastMessageAt).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          loaded ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptyText}>
                Open a club member&rsquo;s profile from the Members list to start a private
                conversation.
              </Text>
            </View>
          ) : null
        }
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  name: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink },
  preview: { fontSize: type.size.sm, color: colors.muted, marginTop: 2 },
  when: { fontSize: type.size.xs, color: colors.muted },
  emptyWrap: { padding: spacing.xl, alignItems: "center", gap: spacing.sm },
  emptyTitle: { fontSize: type.size.lg, fontWeight: type.weight.bold, color: colors.ink },
  emptyText: { fontSize: type.size.sm, color: colors.muted, textAlign: "center", lineHeight: 20 },
});
