import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { currentUser } from "@/services/auth";
import {
  subscribeChannelMessages,
  sendMessage,
  uploadMessageMedia,
  getChannel,
  markChannelRead,
  deleteChannelMessage,
} from "@/services/clubService";
import { setAppBadge } from "@/services/badge";
import { useClub } from "@/services/clubStore";
import type { ClubChannel, ClubMessage, MemberRole } from "@/models/club";
import { colors, radii, shadow, spacing, type } from "@/ui/theme";
import { ChannelIcon } from "../channels";

export default function ChannelChatScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const club = useClub((s) => s.club);
  const members = useClub((s) => s.members);
  const navigation = useNavigation();
  const user = currentUser();

  const [channel, setChannel] = useState<ClubChannel | null>(null);
  const [messages, setMessages] = useState<ClubMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!club || !channelId) return;
    void getChannel(club.id, channelId).then(setChannel);
  }, [club?.id, channelId]);

  // Set header title once channel is loaded
  useEffect(() => {
    if (!channel) return;
    const title =
      channel.iconType === "emoji"
        ? `${channel.icon} ${channel.name}`
        : channel.name;
    navigation.setOptions({ title });
  }, [channel, navigation]);

  useEffect(() => {
    if (!club || !channelId) return;
    return subscribeChannelMessages(club.id, channelId, setMessages);
  }, [club?.id, channelId]);

  // Mark channel as read when screen is focused, and update the app badge to
  // the new global unread total.
  useEffect(() => {
    if (!user || !channelId) return;
    void markChannelRead(user.uid, channelId).then(setAppBadge).catch(() => undefined);
  }, [user?.uid, channelId]);

  const reversed = useMemo(() => [...messages].reverse(), [messages]);

  // Look up each sender's CURRENT club role by uid — roles aren't stored on
  // the message (they'd go stale on promotion), so we resolve live.
  const roleByUid = useMemo(() => {
    const map = new Map<string, MemberRole>();
    for (const m of members) map.set(m.uid, m.role);
    return map;
  }, [members]);
  const myRole = user ? roleByUid.get(user.uid) : undefined;

  const onDeleteMessage = (message: ClubMessage) => {
    if (!club || !channelId) return;
    Alert.alert("Delete message?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          // Optimistically drop it from the list; the subscription will
          // reconcile if the server delete is rejected.
          setMessages((prev) => prev.filter((m) => m.id !== message.id));
          void deleteChannelMessage(club.id, channelId, message).catch(() => {
            Alert.alert("Couldn't delete", "Please try again.");
          });
        },
      },
    ]);
  };

  const onSend = async () => {
    const content = text.trim();
    if (!content || !club || !channelId || !user) return;
    setText("");
    setSending(true);
    try {
      await sendMessage(club.id, channelId, user.uid, user.displayName ?? "Member", content);
    } catch {
      Alert.alert("Error", "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const onPickMedia = async () => {
    if (!club || !channelId || !user) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access to share photos and videos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? (asset.type === "video" ? "video/mp4" : "image/jpeg");
    const mediaType = mimeType.startsWith("video") ? "video" : "photo";

    try {
      const msg = await sendMessage(
        club.id, channelId, user.uid, user.displayName ?? "Member", "", mediaType,
      );
      setMessages((prev) => prev.map((m) =>
        m.id === msg.id ? { ...m, mediaUrl: asset.uri } : m,
      ));
      setUploadingId(msg.id);
      const url = await uploadMessageMedia(club.id, channelId, msg.id, asset.uri, mimeType);
      setMessages((prev) => prev.map((m) =>
        m.id === msg.id ? { ...m, mediaUrl: url } : m,
      ));
    } catch (e) {
      const err = e instanceof Error ? e.message : "Unknown error";
      Alert.alert("Upload failed", err);
    } finally {
      setUploadingId(null);
    }
  };

  if (!club) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No club selected.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        <FlatList
          data={reversed}
          keyExtractor={(m) => m.id}
          inverted
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              isMe={item.authorId === user?.uid}
              role={roleByUid.get(item.authorId)}
              uploading={uploadingId === item.id}
              canDelete={
                !!user &&
                (item.authorId === user.uid || myRole === "owner" || myRole === "admin")
              }
              onDelete={() => onDeleteMessage(item)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No messages yet. Say hi!</Text>
            </View>
          }
        />

        <View style={styles.composer}>
          <Pressable onPress={onPickMedia} hitSlop={8} style={styles.mediaBtn}>
            <Ionicons name="image-outline" size={26} color={colors.ocean} />
          </Pressable>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message..."
            placeholderTextColor={colors.muted}
            multiline
            maxLength={1000}
            returnKeyType="default"
          />
          <Pressable
            onPress={onSend}
            disabled={sending || !text.trim()}
            hitSlop={8}
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          >
            {sending
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Ionicons name="send" size={18} color={colors.white} />
            }
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Per-role accents for chat. Members get no badge and the default bubble so
// the feed stays clean; owner/admin/coach are highlighted.
const ROLE_META: Record<MemberRole, { label: string; color: string; bubbleBg: string } | null> = {
  owner: { label: "OWNER", color: colors.gold, bubbleBg: "#FFF7E6" },
  admin: { label: "ADMIN", color: colors.coral, bubbleBg: "#FFF0EE" },
  coach: { label: "COACH", color: colors.teal, bubbleBg: "#E9F9F6" },
  member: null,
};

function MessageBubble({
  message,
  isMe,
  role,
  uploading,
  canDelete,
  onDelete,
}: {
  message: ClubMessage;
  isMe: boolean;
  role?: MemberRole;
  uploading: boolean;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const roleMeta = role ? ROLE_META[role] : null;

  return (
    <Pressable
      onLongPress={canDelete ? onDelete : undefined}
      delayLongPress={300}
      style={[styles.row, isMe ? styles.rowMe : styles.rowThem]}
    >
      <View
        style={[
          styles.bubble,
          isMe ? styles.bubbleMe : styles.bubbleThem,
          !isMe && roleMeta && {
            backgroundColor: roleMeta.bubbleBg,
            borderLeftWidth: 3,
            borderLeftColor: roleMeta.color,
          },
        ]}
      >
        {!isMe && (
          <View style={styles.authorRow}>
            <Text style={[styles.authorName, roleMeta && { color: roleMeta.color }]}>
              {message.authorName}
            </Text>
            {roleMeta && (
              <View style={[styles.roleChip, { backgroundColor: roleMeta.color }]}>
                <Text style={styles.roleChipText}>{roleMeta.label}</Text>
              </View>
            )}
          </View>
        )}

        {message.mediaType === "photo" && message.mediaUrl && (
          <View style={styles.mediaWrap}>
            <Image
              source={{ uri: message.mediaUrl }}
              style={styles.mediaImage}
              resizeMode="cover"
            />
            {uploading && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator color={colors.white} />
              </View>
            )}
          </View>
        )}

        {message.mediaType === "video" && message.mediaUrl && (
          <VideoBubble uri={message.mediaUrl} uploading={uploading} />
        )}

        {message.content.length > 0 && (
          <Text style={[styles.msgText, isMe && styles.msgTextMe]}>
            {message.content}
          </Text>
        )}

        <Text style={[styles.timestamp, isMe && styles.timestampMe]}>{time}</Text>
      </View>
    </Pressable>
  );
}

function VideoBubble({ uri, uploading }: { uri: string; uploading: boolean }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = false; });
  return (
    <View style={styles.mediaWrap}>
      <VideoView
        player={player}
        style={styles.mediaImage}
        nativeControls
        fullscreenOptions={{ enable: true }}
      />
      {uploading && (
        <View style={styles.uploadingOverlay}>
          <ActivityIndicator color={colors.white} />
        </View>
      )}
    </View>
  );
}

const BUBBLE_MAX = "78%";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgSoft },
  flex: { flex: 1 },
  list: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  row: { marginVertical: 3 },
  rowMe: { alignItems: "flex-end" },
  rowThem: { alignItems: "flex-start" },
  bubble: {
    maxWidth: BUBBLE_MAX,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadow.sm,
  },
  bubbleMe: { backgroundColor: colors.ocean },
  bubbleThem: { backgroundColor: colors.white },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: 2,
  },
  authorName: {
    fontSize: type.size.xs,
    fontWeight: type.weight.bold,
    color: colors.ocean,
  },
  roleChip: {
    borderRadius: radii.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  roleChipText: {
    fontSize: 9,
    fontWeight: type.weight.heavy,
    letterSpacing: 0.5,
    color: colors.white,
  },
  msgText: { fontSize: type.size.md, color: colors.ink, lineHeight: 20 },
  msgTextMe: { color: colors.white },
  timestamp: { fontSize: 10, color: colors.muted, marginTop: 2, alignSelf: "flex-end" },
  timestampMe: { color: "rgba(255,255,255,0.65)" },
  mediaWrap: { position: "relative", marginBottom: spacing.xs },
  mediaImage: { width: 220, height: 160, borderRadius: radii.md },
  uploadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.white,
    gap: spacing.sm,
  },
  mediaBtn: { paddingBottom: spacing.xs + 2 },
  input: {
    flex: 1,
    backgroundColor: colors.bgSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === "ios" ? spacing.sm : spacing.xs,
    fontSize: type.size.md,
    color: colors.ink,
    maxHeight: 100,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.ocean,
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyWrap: { flex: 1, alignItems: "center", paddingTop: spacing.xxl },
  emptyText: { color: colors.muted, fontSize: type.size.md },
});
