import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { currentUser } from "@/services/auth";
import {
  deleteDmMessage,
  markDmRead,
  sendDmMessage,
  subscribeDmMessages,
  toggleDmReaction,
} from "@/services/dmService";
import { setAppBadge } from "@/services/badge";
import { db } from "@/services/firebase";
import type { DmMessage, DmThread } from "@/models/club";
import { Avatar } from "@/ui/Avatar";
import { LinkifiedText } from "@/ui/LinkifiedText";
import { colors, radii, shadow, spacing, type } from "@/ui/theme";

const REACTION_EMOJI = ["👍", "❤️", "😂", "🤙", "🔥", "😮"];

export default function DmThreadScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const user = currentUser();

  const [thread, setThread] = useState<DmThread | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [actionTarget, setActionTarget] = useState<DmMessage | null>(null);

  useEffect(() => {
    if (!threadId) return;
    void getDoc(doc(db, "dms", threadId)).then((snap) => {
      if (snap.exists()) setThread(snap.data() as DmThread);
    });
  }, [threadId]);

  const otherUid = useMemo(
    () => thread?.participants.find((p) => p !== user?.uid),
    [thread, user?.uid],
  );
  const otherName = otherUid ? (thread?.participantNames?.[otherUid] ?? "Member") : "";

  useEffect(() => {
    if (otherName) navigation.setOptions({ title: otherName });
  }, [otherName, navigation]);

  useEffect(() => {
    if (!threadId) return;
    return subscribeDmMessages(threadId, setMessages);
  }, [threadId]);

  // Clear this thread's unread count on open, and sync the app-icon badge to
  // the new global total. Re-runs when messages arrive so a thread read while
  // it's on screen doesn't stay counted.
  useEffect(() => {
    if (!user || !threadId) return;
    void markDmRead(user.uid, threadId).then(setAppBadge).catch(() => undefined);
  }, [user?.uid, threadId, messages.length]);

  const reversed = useMemo(() => [...messages].reverse(), [messages]);

  const onSend = async () => {
    const content = text.trim();
    if (!content || !threadId || !user) return;
    setText("");
    setSending(true);
    try {
      await sendDmMessage(threadId, user.uid, user.displayName ?? "Member", content);
    } catch (e) {
      // Surface the real error rather than a generic string: the failure that
      // matters here is a rules denial (permission-denied), and hiding its
      // code makes an undeployed firestore.rules look like a code bug.
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Couldn't send", msg);
    } finally {
      setSending(false);
    }
  };

  const onToggleReaction = (message: DmMessage, emoji: string) => {
    if (!threadId || !user) return;
    const uid = user.uid;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== message.id) return m;
        const uids = m.reactions?.[emoji] ?? [];
        const next = uids.includes(uid) ? uids.filter((u) => u !== uid) : [...uids, uid];
        return { ...m, reactions: { ...(m.reactions ?? {}), [emoji]: next } };
      }),
    );
    void toggleDmReaction(threadId, message, emoji, uid).catch(() => undefined);
  };

  const onDelete = (message: DmMessage) => {
    if (!threadId) return;
    Alert.alert("Delete message?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setMessages((prev) => prev.filter((m) => m.id !== message.id));
          void deleteDmMessage(threadId, message.id).catch(() => {
            Alert.alert("Couldn't delete", "Please try again.");
          });
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 44 : 0}
      >
        <FlatList
          data={reversed}
          keyExtractor={(m) => m.id}
          inverted
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Bubble
              message={item}
              isMe={item.authorId === user?.uid}
              myUid={user?.uid}
              avatarUrl={
                item.authorId === otherUid ? thread?.participantAvatars?.[item.authorId] : undefined
              }
              onLongPress={() => setActionTarget(item)}
              onToggleReaction={(e) => onToggleReaction(item, e)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                No messages yet. Say hi to {otherName || "them"}.
              </Text>
            </View>
          }
        />

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message..."
            placeholderTextColor={colors.muted}
            multiline
            maxLength={1000}
          />
          <Pressable
            onPress={onSend}
            disabled={sending || !text.trim()}
            hitSlop={8}
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons name="send" size={18} color={colors.white} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {actionTarget && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setActionTarget(null)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setActionTarget(null)}>
            <View style={styles.sheetCard}>
              <View style={styles.emojiRow}>
                {REACTION_EMOJI.map((e) => (
                  <Pressable
                    key={e}
                    style={styles.emojiBtn}
                    onPress={() => {
                      onToggleReaction(actionTarget, e);
                      setActionTarget(null);
                    }}
                  >
                    <Text style={styles.emojiTxt}>{e}</Text>
                  </Pressable>
                ))}
              </View>
              {actionTarget.authorId === user?.uid && (
                <Pressable
                  style={styles.sheetRow}
                  onPress={() => {
                    const target = actionTarget;
                    setActionTarget(null);
                    onDelete(target);
                  }}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  <Text style={[styles.sheetRowText, { color: colors.danger }]}>Delete</Text>
                </Pressable>
              )}
            </View>
          </Pressable>
        </Modal>
      )}
    </SafeAreaView>
  );
}

function Bubble({
  message,
  isMe,
  myUid,
  avatarUrl,
  onLongPress,
  onToggleReaction,
}: {
  message: DmMessage;
  isMe: boolean;
  myUid?: string;
  avatarUrl?: string;
  onLongPress: () => void;
  onToggleReaction: (emoji: string) => void;
}) {
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const reactionEntries = Object.entries(message.reactions ?? {}).filter(([, u]) => u.length > 0);

  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={300}
      style={[styles.row, isMe ? styles.rowMe : styles.rowThem]}
    >
      {!isMe && (
        <Avatar uri={avatarUrl} name={message.authorName} uid={message.authorId} size={28} />
      )}
      <View style={{ flexShrink: 1 }}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <LinkifiedText
            text={message.content}
            style={[styles.messageText, isMe && { color: colors.white }]}
            linkStyle={{ color: isMe ? colors.seafoam : colors.ocean }}
          />
          <Text style={[styles.time, isMe && { color: "rgba(255,255,255,0.7)" }]}>{time}</Text>
        </View>

        {reactionEntries.length > 0 && (
          <View style={[styles.reactionRow, isMe && { justifyContent: "flex-end" }]}>
            {reactionEntries.map(([emoji, uids]) => (
              <Pressable
                key={emoji}
                onPress={() => onToggleReaction(emoji)}
                style={[
                  styles.reactionChip,
                  !!myUid && uids.includes(myUid) && styles.reactionChipMine,
                ]}
              >
                <Text style={styles.reactionText}>
                  {emoji} {uids.length}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  list: { padding: spacing.md, paddingBottom: spacing.lg },
  row: { marginVertical: 3, flexDirection: "row", alignItems: "flex-end", gap: spacing.xs },
  rowMe: { justifyContent: "flex-end" },
  rowThem: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "80%",
    flexShrink: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadow.sm,
  },
  bubbleMe: { backgroundColor: colors.ocean },
  bubbleThem: { backgroundColor: colors.white },
  messageText: { fontSize: type.size.md, color: colors.ink, lineHeight: 20 },
  time: { fontSize: 10, color: colors.muted, marginTop: 3, textAlign: "right" },
  reactionRow: { flexDirection: "row", gap: 4, marginTop: 3, flexWrap: "wrap" },
  reactionChip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  reactionChipMine: { borderColor: colors.ocean },
  reactionText: { fontSize: 12, color: colors.ink },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    padding: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.white,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: type.size.md,
    color: colors.ink,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.ocean,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: colors.line },
  emptyWrap: { padding: spacing.xl, alignItems: "center", transform: [{ scaleY: -1 }] },
  emptyText: { color: colors.muted, fontSize: type.size.sm, textAlign: "center" },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheetCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
  },
  emojiRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: spacing.md },
  emojiBtn: { padding: spacing.xs },
  emojiTxt: { fontSize: 26 },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  sheetRowText: { fontSize: type.size.md, color: colors.ink },
});
