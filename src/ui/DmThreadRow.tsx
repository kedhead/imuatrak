import { Ionicons } from "@expo/vector-icons";
import { useRef } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import Swipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { dmThreadTitle, groupMemberSummary, type DmThread } from "@/models/club";
import { Avatar } from "./Avatar";
import { colors, radii, spacing, type } from "./theme";

/** "2:14 PM" today, "Mon" this week, "Nov 3" otherwise. */
function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (now.getTime() - d.getTime() < 6 * 86_400_000) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * One conversation in a list — a direct message or a group chat. Shared by
 * the Messages screen and the Direct Messages section on Channels.
 */
export function DmThreadRow({
  thread,
  myUid,
  unread = 0,
  variant = "card",
  hidden = false,
  onHide,
  onUnhide,
  onPress,
}: {
  thread: DmThread & { id: string };
  myUid: string | undefined;
  unread?: number;
  /** "list" matches the full-width channel rows on the Channels screen. */
  variant?: "card" | "list";
  /** Shown dimmed because the user hid it (Messages → "Show hidden"). */
  hidden?: boolean;
  /** Swipe left / long-press → Hide. Omit to make the row non-swipeable. */
  onHide?: () => void;
  /** For a hidden row: swipe / long-press → Show. */
  onUnhide?: () => void;
  onPress: () => void;
}) {
  const swipeRef = useRef<SwipeableMethods>(null);
  const action = hidden ? onUnhide : onHide;
  const title = dmThreadTitle(thread, myUid);
  const otherUid = thread.isGroup ? undefined : thread.participants.find((p) => p !== myUid);
  const hasUnread = unread > 0;

  const confirm = () => {
    if (!action) return;
    Alert.alert(
      hidden ? "Show this conversation?" : `Hide ${title}?`,
      hidden
        ? "It'll go back on your list."
        : "It disappears from your list until there's a new message. Nothing is deleted, and nobody else is affected.",
      [
        { text: "Cancel", style: "cancel" },
        { text: hidden ? "Show" : "Hide", onPress: action },
      ],
    );
  };

  const row = (
    <Pressable
      style={[styles.row, variant === "list" && styles.listRow, hidden && styles.hiddenRow]}
      onPress={onPress}
      onLongPress={action ? confirm : undefined}
      delayLongPress={350}
    >
      {thread.isGroup ? (
        <View style={styles.groupAvatar}>
          <Ionicons name="people" size={20} color={colors.white} />
        </View>
      ) : (
        <Avatar uri={otherUid ? thread.participantAvatars?.[otherUid] : undefined} name={title} uid={otherUid ?? ""} size={40} />
      )}
      <View style={styles.text}>
        <Text style={[styles.name, hasUnread && styles.bold]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.preview, hasUnread && styles.previewUnread]} numberOfLines={1}>
          {thread.lastMessagePreview ||
            (thread.isGroup ? groupMemberSummary(thread, myUid) : "No messages yet")}
        </Text>
      </View>
      <View style={styles.right}>
        {!!(thread.lastMessageAt ?? thread.createdAt) && (
          <Text style={[styles.when, hasUnread && { color: colors.ocean }]}>
            {when(thread.lastMessageAt ?? thread.createdAt)}
          </Text>
        )}
        {hasUnread && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );

  if (!action) return row;
  return (
    <Swipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          style={[styles.swipeAction, hidden && { backgroundColor: colors.ocean }]}
          onPress={() => {
            swipeRef.current?.close();
            action();
          }}
        >
          <Ionicons name={hidden ? "eye-outline" : "eye-off-outline"} size={20} color={colors.white} />
          <Text style={styles.swipeText}>{hidden ? "Show" : "Hide"}</Text>
        </Pressable>
      )}
    >
      {row}
    </Swipeable>
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
  listRow: {
    borderRadius: 0,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  hiddenRow: { opacity: 0.55 },
  swipeAction: {
    width: 84,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: colors.muted,
  },
  swipeText: { fontSize: type.size.xs, fontWeight: type.weight.bold, color: colors.white },
  groupAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.oceanLight,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, minWidth: 0 },
  name: { fontSize: type.size.md, fontWeight: type.weight.medium, color: colors.ink },
  bold: { fontWeight: type.weight.heavy },
  preview: { fontSize: type.size.sm, color: colors.muted, marginTop: 2 },
  previewUnread: { color: colors.inkSoft },
  right: { alignItems: "flex-end", gap: 4 },
  when: { fontSize: type.size.xs, color: colors.muted },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.coral,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 11, fontWeight: type.weight.heavy, color: colors.white },
});
