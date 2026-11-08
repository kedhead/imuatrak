import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { currentUser } from "@/services/auth";
import { setAppBadge } from "@/services/badge";
import { hideDmThread, subscribeDmThreads, unhideDmThread } from "@/services/dmService";
import { useDmUnreadByThread, useHiddenDmThreads } from "@/services/unread";
import { isDmThreadHidden, type DmThread } from "@/models/club";
import { DmThreadRow } from "@/ui/DmThreadRow";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, radii, spacing, type } from "@/ui/theme";

export default function DmListScreen() {
  const user = currentUser();
  const [threads, setThreads] = useState<(DmThread & { id: string })[]>([]);
  const [loaded, setLoaded] = useState(false);
  const unread = useDmUnreadByThread(user?.uid);
  const hiddenAt = useHiddenDmThreads(user?.uid);
  // Opened from Channels' "N hidden" link → start with hidden ones showing.
  const { showHidden: showHiddenParam } = useLocalSearchParams<{ showHidden?: string }>();
  const [showHidden, setShowHidden] = useState(showHiddenParam === "1");
  const uid = user?.uid;

  const isHidden = (t: DmThread & { id: string }) =>
    isDmThreadHidden(t, hiddenAt[t.id], unread[t.id] ?? 0);
  const hiddenCount = threads.filter(isHidden).length;
  const rows = showHidden ? threads : threads.filter((t) => !isHidden(t));

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
        data={rows}
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
            myUid={uid}
            unread={unread[item.id] ?? 0}
            hidden={isHidden(item)}
            onHide={() => {
              if (uid) void hideDmThread(uid, item.id).then(setAppBadge).catch(() => undefined);
            }}
            onUnhide={() => {
              if (uid) void unhideDmThread(uid, item.id).catch(() => undefined);
            }}
            onPress={() => router.push(`/dm/${item.id}`)}
          />
        )}
        ListFooterComponent={
          hiddenCount > 0 ? (
            <Pressable style={styles.hiddenToggle} onPress={() => setShowHidden((v) => !v)}>
              <Ionicons name={showHidden ? "eye-off-outline" : "eye-outline"} size={15} color={colors.muted} />
              <Text style={styles.hiddenToggleText}>
                {showHidden ? "Hide hidden conversations" : `Show hidden (${hiddenCount})`}
              </Text>
            </Pressable>
          ) : undefined
        }
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
  hiddenToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.md,
  },
  hiddenToggleText: { fontSize: type.size.sm, color: colors.muted, fontWeight: type.weight.medium },
  emptyWrap: { padding: spacing.xl, alignItems: "center", gap: spacing.sm },
  emptyTitle: { fontSize: type.size.lg, fontWeight: type.weight.bold, color: colors.ink },
  emptyText: { fontSize: type.size.sm, color: colors.muted, textAlign: "center", lineHeight: 20 },
});
