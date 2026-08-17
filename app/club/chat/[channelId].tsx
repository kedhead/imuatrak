import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library/legacy";
import * as Sharing from "expo-sharing";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
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
  subscribeChannelMessages,
  sendMessage,
  uploadMessageMedia,
  getChannel,
  getClubMembers,
  markChannelRead,
  deleteChannelMessage,
  setMessagePinned,
  toggleMessageReaction,
} from "@/services/clubService";
import { setAppBadge } from "@/services/badge";
import {
  applyMention,
  caretAfterEdit,
  matchMentionCandidates,
  mentionQueryAt,
  resolveMentions,
  type MentionTarget,
} from "@/services/mentions";
import { extractImageUrls, LinkifiedText } from "@/ui/LinkifiedText";
import { useClub } from "@/services/clubStore";
import type { ClubChannel, ClubMember, ClubMessage, MemberRole } from "@/models/club";
import { Avatar } from "@/ui/Avatar";
import { colors, radii, shadow, spacing, type } from "@/ui/theme";
import { ChannelIcon } from "../channels";

export default function ChannelChatScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const insets = useSafeAreaInsets();
  const club = useClub((s) => s.club);
  const members = useClub((s) => s.members);
  const navigation = useNavigation();
  const user = currentUser();

  const [channel, setChannel] = useState<ClubChannel | null>(null);
  const [messages, setMessages] = useState<ClubMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  // Caret position, tracked so the @-autocomplete knows which token is being
  // typed rather than always looking at the end of the message.
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  // Long-press action sheet target, reply-compose target, full-screen viewer.
  const [actionTarget, setActionTarget] = useState<ClubMessage | null>(null);
  const [replyTarget, setReplyTarget] = useState<NonNullable<ClubMessage["replyTo"]> | null>(null);
  const [viewer, setViewer] = useState<{ urls: string[]; index: number } | null>(null);
  // Which page the viewer is currently showing (updated on swipe), the
  // WhatsApp-style action menu, and a guard so a save/share can't fire twice
  // mid-download.
  const [viewerPage, setViewerPage] = useState(0);
  const [viewerMenu, setViewerMenu] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  // Roster fallback for @-mentions. The club store's copy is filled by the
  // club loader; if that hasn't run for this club the picker would have
  // nobody to offer and could never open, with no visible reason why.
  const [fetchedMembers, setFetchedMembers] = useState<ClubMember[]>([]);

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

  useEffect(() => {
    if (!club || members.length > 0) return;
    void getClubMembers(club.id).then(setFetchedMembers).catch(() => undefined);
  }, [club?.id, members.length]);
  const roster = members.length > 0 ? members : fetchedMembers;

  const reversed = useMemo(() => [...messages].reverse(), [messages]);

  // Look up each sender's CURRENT club role by uid — roles aren't stored on
  // the message (they'd go stale on promotion), so we resolve live.
  const roleByUid = useMemo(() => {
    const map = new Map<string, MemberRole>();
    for (const m of members) map.set(m.uid, m.role);
    return map;
  }, [members]);

  // Same reasoning as roles: resolve the photo from the roster rather than a
  // copy on the message, so changing it updates a member's whole history.
  const avatarByUid = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) if (m.avatarUrl) map.set(m.uid, m.avatarUrl);
    return map;
  }, [members]);
  const myRole = user ? roleByUid.get(user.uid) : undefined;

  // Who can be @-mentioned: the whole roster for a public channel, only the
  // channel's own members for a private one — offering someone who can't read
  // the message would tag them into silence.
  const mentionTargets = useMemo<MentionTarget[]>(() => {
    const allowed = channel?.isPrivate
      ? roster.filter((m) => channel.memberIds.includes(m.uid))
      : roster;
    return allowed
      .filter((m) => m.displayName?.trim())
      .map((m) => ({ uid: m.uid, name: m.displayName.trim() }));
  }, [roster, channel?.isPrivate, channel?.memberIds]);

  // Candidates for the mention picker, or null when no @query is being typed.
  const mentionQuery = mentionQueryAt(text, Math.min(cursor, text.length));
  const mentionCandidates = mentionQuery
    ? matchMentionCandidates(
        mentionQuery.query,
        mentionTargets.filter((t) => t.uid !== user?.uid),
      )
    : [];

  /**
   * Open the picker explicitly. Typing "@" should do this on its own, but that
   * relies on inferring the caret from keyboard events; this button is the
   * deterministic path and makes the feature discoverable besides.
   */
  const onOpenMentions = () => {
    const next = `${text}${text.length > 0 && !/\s$/.test(text) ? " " : ""}@`;
    setText(next);
    setCursor(next.length);
    inputRef.current?.focus();
  };

  const onPickMention = (target: MentionTarget) => {
    if (!mentionQuery) return;
    const next = applyMention(text, mentionQuery.start, cursor, target.name);
    setText(next.text);
    setCursor(next.cursor);
    inputRef.current?.focus();
  };

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

  // Chat media are remote URLs; both saving and sharing need a local file
  // first. Download to the cache with the right extension so Photos and the
  // share sheet recognize the type.
  const downloadOne = async (url: string, isVideo: boolean) => {
    const rand = Math.random().toString(36).slice(2, 7);
    const target = `${FileSystem.cacheDirectory}imuatrak-chat-${Date.now()}-${rand}.${isVideo ? "mp4" : "jpg"}`;
    const { uri } = await FileSystem.downloadAsync(url, target);
    return uri;
  };

  /**
   * One-tap "Save to Photos" — write the media straight to the device camera
   * roll via MediaLibrary. Handles a whole message's worth of photos (or a
   * single video). Requests add-only permission the first time; if denied,
   * points to Settings rather than failing silently.
   */
  const saveUrlsToPhotos = async (rawUrls: (string | undefined)[], isVideo: boolean) => {
    const urls = rawUrls.filter((u): u is string => !!u);
    if (!urls.length || savingImage) return;
    setSavingImage(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          "Allow photo access in Settings to save to your library.",
        );
        return;
      }
      for (const url of urls) {
        const uri = await downloadOne(url, isVideo);
        await MediaLibrary.saveToLibraryAsync(uri);
      }
      setViewerMenu(false);
      const label = isVideo ? "Video" : urls.length > 1 ? `${urls.length} photos` : "Photo";
      Alert.alert("Saved", `${label} saved to your library.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Couldn't save", msg);
    } finally {
      setSavingImage(false);
    }
  };

  /** Hand a single item to the OS share sheet (Messages, Instagram, etc.). */
  const shareOne = async (url: string | undefined, isVideo: boolean) => {
    if (!url || savingImage) return;
    setSavingImage(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Sharing unavailable", "This device can't share files.");
        return;
      }
      const uri = await downloadOne(url, isVideo);
      setViewerMenu(false);
      await Sharing.shareAsync(
        uri,
        isVideo ? { mimeType: "video/mp4" } : { mimeType: "image/jpeg", UTI: "public.jpeg" },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Couldn't share", msg);
    } finally {
      setSavingImage(false);
    }
  };

  // Pull the savable media out of a message: a video's single URL, or all of
  // its photos (multi-image grid, or the legacy single mediaUrl).
  const mediaOf = (m: ClubMessage): { urls: string[]; isVideo: boolean } => {
    if (m.mediaType === "video" && m.mediaUrl) return { urls: [m.mediaUrl], isVideo: true };
    const photos = m.mediaUrls && m.mediaUrls.length > 0 ? m.mediaUrls : m.mediaUrl ? [m.mediaUrl] : [];
    return { urls: photos, isVideo: false };
  };

  const onTogglePin = (message: ClubMessage) => {
    if (!club || !channelId || !user) return;
    const pinning = !message.pinnedAt;
    // Optimistic; the subscription reconciles if the write is rejected.
    setMessages((prev) =>
      prev.map((m) =>
        m.id === message.id
          ? {
              ...m,
              pinnedAt: pinning ? new Date().toISOString() : undefined,
              pinnedBy: pinning ? user.uid : undefined,
            }
          : m,
      ),
    );
    void setMessagePinned(club.id, channelId, message.id, pinning, user.uid).catch(() => {
      Alert.alert("Couldn't update pin", "Please try again.");
    });
  };

  const previewOf = (m: ClubMessage): string =>
    m.content.trim().length > 0
      ? m.content.trim().slice(0, 80)
      : m.mediaType === "video"
        ? "Video"
        : "Photo";

  const onToggleReaction = (message: ClubMessage, emoji: string) => {
    if (!club || !channelId || !user) return;
    const uid = user.uid;
    // Optimistic flip; the onSnapshot subscription reconciles with the server.
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== message.id) return m;
        const uids = m.reactions?.[emoji] ?? [];
        const next = uids.includes(uid) ? uids.filter((u) => u !== uid) : [...uids, uid];
        return { ...m, reactions: { ...(m.reactions ?? {}), [emoji]: next } };
      }),
    );
    void toggleMessageReaction(club.id, channelId, message, emoji, uid).catch(() => undefined);
  };

  const onSend = async () => {
    const content = text.trim();
    if (!content || !club || !channelId || !user) return;
    const replyTo = replyTarget ?? undefined;
    // Resolve against the final text, so a mention the author typed and then
    // deleted never fires a notification.
    const mentions = resolveMentions(content, mentionTargets);
    setText("");
    setCursor(0);
    setReplyTarget(null);
    setSending(true);
    try {
      await sendMessage(
        club.id, channelId, user.uid, user.displayName ?? "Member", content,
        { replyTo, mentions },
      );
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
      allowsMultipleSelection: true,
      selectionLimit: 8,
    });
    if (result.canceled || result.assets.length === 0) return;

    const name = user.displayName ?? "Member";
    const isVideo = (a: ImagePicker.ImagePickerAsset) =>
      (a.mimeType ?? "").startsWith("video") || a.type === "video";
    const videos = result.assets.filter(isVideo);
    const images = result.assets.filter((a) => !isVideo(a));

    try {
      // Each video is its own message (single-attachment flow).
      for (const v of videos) {
        const mime = v.mimeType ?? "video/mp4";
        const msg = await sendMessage(club.id, channelId, user.uid, name, "", { mediaType: "video" });
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, mediaUrl: v.uri } : m)));
        setUploadingId(msg.id);
        const url = await uploadMessageMedia(club.id, channelId, msg.id, v.uri, mime);
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, mediaUrl: url } : m)));
        setUploadingId(null);
      }

      if (images.length === 1) {
        const img = images[0]!;
        const mime = img.mimeType ?? "image/jpeg";
        const msg = await sendMessage(club.id, channelId, user.uid, name, "", { mediaType: "photo" });
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, mediaUrl: img.uri } : m)));
        setUploadingId(msg.id);
        const url = await uploadMessageMedia(club.id, channelId, msg.id, img.uri, mime);
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, mediaUrl: url } : m)));
      } else if (images.length > 1) {
        // One message carrying all images — rendered as a WhatsApp-style grid.
        const msg = await sendMessage(club.id, channelId, user.uid, name, "", { mediaType: "photo" });
        const localUris = images.map((i) => i.uri);
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, mediaUrls: localUris } : m)));
        setUploadingId(msg.id);
        const uploaded: string[] = [];
        for (let i = 0; i < images.length; i++) {
          const img = images[i]!;
          const mime = img.mimeType ?? "image/jpeg";
          const url = await uploadMessageMedia(
            club.id, channelId, msg.id, img.uri, mime, `media-${i}`,
          );
          uploaded.push(url);
          const merged = [...uploaded, ...localUris.slice(uploaded.length)];
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, mediaUrls: merged } : m)));
        }
      }
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
        // Header = status bar (safe-area top inset, varies by device) + 44pt
        // nav bar. The old hardcoded 88 was wrong on notched iPhones, so the
        // keyboard overlapped the newest chat bubbles.
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 44 : 0}
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
              avatarUrl={avatarByUid.get(item.authorId)}
              uploading={uploadingId === item.id}
              myUid={user?.uid}
              mentionTargets={mentionTargets}
              onLongPress={() => setActionTarget(item)}
              onToggleReaction={(emoji) => onToggleReaction(item, emoji)}
              onPressImage={(urls, index) => {
                setViewerPage(index);
                setViewerMenu(false);
                setViewer({ urls, index });
              }}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No messages yet. Say hi!</Text>
            </View>
          }
        />

        {replyTarget && (
          <View style={styles.replyBar}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.replyBarName}>Replying to {replyTarget.authorName}</Text>
              <Text style={styles.replyBarSnippet} numberOfLines={1}>{replyTarget.preview}</Text>
            </View>
            <Pressable onPress={() => setReplyTarget(null)} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>
        )}

        {/* @-mention picker — sits directly above the composer, like the
            reply bar, and only while an @query is being typed. */}
        {mentionQuery && (
          <View style={styles.mentionBar}>
            {mentionCandidates.length === 0 ? (
              <Text style={styles.mentionEmpty}>
                {mentionTargets.length <= 1
                  ? "No one else in this channel to mention yet."
                  : `No one matching "${mentionQuery.query}".`}
              </Text>
            ) : (
              <FlatList
                horizontal
                keyboardShouldPersistTaps="always"
                showsHorizontalScrollIndicator={false}
                data={mentionCandidates}
                keyExtractor={(m) => m.uid}
                contentContainerStyle={styles.mentionList}
                renderItem={({ item }) => (
                  <Pressable style={styles.mentionChip} onPress={() => onPickMention(item)}>
                    <Ionicons name="at" size={14} color={colors.ocean} />
                    <Text style={styles.mentionChipText} numberOfLines={1}>{item.name}</Text>
                  </Pressable>
                )}
              />
            )}
          </View>
        )}

        <View style={styles.composer}>
          <Pressable onPress={onPickMedia} hitSlop={8} style={styles.mediaBtn}>
            <Ionicons name="image-outline" size={26} color={colors.ocean} />
          </Pressable>
          <Pressable onPress={onOpenMentions} hitSlop={8} style={styles.mediaBtn}>
            <Ionicons name="at" size={24} color={colors.ocean} />
          </Pressable>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={text}
            onChangeText={(next) => {
              // Derive the caret from the edit itself wherever possible, so
              // the mention picker still works if onSelectionChange never
              // fires — relying on that event alone left the caret at 0 and
              // the picker could never open.
              const caret = caretAfterEdit(text, next);
              setText(next);
              if (caret !== null) setCursor(caret);
            }}
            // Authoritative when it fires, and the only way to know the caret
            // after a tap or a mid-text edit. iOS and Android disagree on
            // whether it arrives before or after onChangeText, so the two
            // states can be one render out of step; the query is clamped
            // below and the next render settles it.
            onSelectionChange={(e) => setCursor(e.nativeEvent.selection.end)}
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

      {/* Long-press action sheet: react / reply / delete */}
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
              <Pressable
                style={styles.sheetRow}
                onPress={() => {
                  setReplyTarget({
                    messageId: actionTarget.id,
                    authorName: actionTarget.authorName,
                    preview: previewOf(actionTarget),
                  });
                  setActionTarget(null);
                }}
              >
                <Ionicons name="arrow-undo-outline" size={20} color={colors.ink} />
                <Text style={styles.sheetRowText}>Reply</Text>
              </Pressable>
              {mediaOf(actionTarget).urls.length > 0 && (
                <>
                  <Pressable
                    style={styles.sheetRow}
                    disabled={savingImage}
                    onPress={() => {
                      const { urls, isVideo } = mediaOf(actionTarget);
                      setActionTarget(null);
                      void saveUrlsToPhotos(urls, isVideo);
                    }}
                  >
                    <Ionicons name="download-outline" size={20} color={colors.ink} />
                    <Text style={styles.sheetRowText}>
                      {mediaOf(actionTarget).isVideo ? "Save video" : "Save to Photos"}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.sheetRow}
                    disabled={savingImage}
                    onPress={() => {
                      const { urls, isVideo } = mediaOf(actionTarget);
                      setActionTarget(null);
                      void shareOne(urls[0], isVideo);
                    }}
                  >
                    <Ionicons name="share-outline" size={20} color={colors.ink} />
                    <Text style={styles.sheetRowText}>Share</Text>
                  </Pressable>
                </>
              )}
              {(myRole === "owner" || myRole === "admin") && (
                <Pressable
                  style={styles.sheetRow}
                  onPress={() => {
                    const target = actionTarget;
                    setActionTarget(null);
                    onTogglePin(target);
                  }}
                >
                  <Ionicons
                    name={actionTarget.pinnedAt ? "pin" : "pin-outline"}
                    size={20}
                    color={colors.ink}
                  />
                  <Text style={styles.sheetRowText}>
                    {actionTarget.pinnedAt ? "Unpin" : "Pin"}
                  </Text>
                </Pressable>
              )}
              {!!user &&
                (actionTarget.authorId === user.uid || myRole === "owner" || myRole === "admin") && (
                <Pressable
                  style={styles.sheetRow}
                  onPress={() => {
                    const target = actionTarget;
                    setActionTarget(null);
                    onDeleteMessage(target);
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

      {/* Full-screen image viewer with horizontal paging */}
      {viewer && (
        <Modal visible animationType="fade" onRequestClose={() => setViewer(null)} statusBarTranslucent>
          <View style={styles.viewerBg}>
            <FlatList
              horizontal
              pagingEnabled
              data={viewer.urls}
              initialScrollIndex={viewer.index}
              getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
              keyExtractor={(_, i) => String(i)}
              onMomentumScrollEnd={(e) =>
                setViewerPage(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))
              }
              renderItem={({ item }) => (
                <Pressable
                  style={styles.viewerPage}
                  onPress={() => setViewer(null)}
                  onLongPress={() => setViewerMenu(true)}
                  delayLongPress={300}
                >
                  <Image source={{ uri: item }} style={styles.viewerImage} resizeMode="contain" />
                </Pressable>
              )}
            />
            <Pressable
              style={[styles.viewerClose, { top: Math.max(insets.top, spacing.sm) }]}
              onPress={() => setViewer(null)}
              hitSlop={16}
            >
              <Ionicons name="close" size={30} color={colors.white} />
            </Pressable>

            {/* WhatsApp-style action menu for the visible image */}
            {viewerMenu && (
              <Pressable style={styles.viewerMenuBackdrop} onPress={() => setViewerMenu(false)}>
                <Pressable style={styles.viewerMenuSheet} onPress={(e) => e.stopPropagation()}>
                  <Pressable
                    style={styles.sheetRow}
                    onPress={() => saveUrlsToPhotos([viewer.urls[viewerPage]], false)}
                    disabled={savingImage}
                  >
                    {savingImage ? (
                      <ActivityIndicator size="small" color={colors.ink} />
                    ) : (
                      <Ionicons name="download-outline" size={22} color={colors.ink} />
                    )}
                    <Text style={styles.sheetRowText}>Save to Photos</Text>
                  </Pressable>
                  <Pressable
                    style={styles.sheetRow}
                    onPress={() => shareOne(viewer.urls[viewerPage], false)}
                    disabled={savingImage}
                  >
                    <Ionicons name="share-outline" size={22} color={colors.ink} />
                    <Text style={styles.sheetRowText}>Share</Text>
                  </Pressable>
                  <Pressable style={styles.sheetRow} onPress={() => setViewerMenu(false)}>
                    <Ionicons name="close-outline" size={22} color={colors.muted} />
                    <Text style={[styles.sheetRowText, { color: colors.muted }]}>Cancel</Text>
                  </Pressable>
                </Pressable>
              </Pressable>
            )}
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const SCREEN_W = Dimensions.get("window").width;
const REACTION_EMOJI = ["👍", "❤️", "😂", "🤙", "🔥", "😮"];

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
  avatarUrl,
  uploading,
  myUid,
  mentionTargets,
  onLongPress,
  onToggleReaction,
  onPressImage,
}: {
  message: ClubMessage;
  isMe: boolean;
  role?: MemberRole;
  /** Resolved live from the roster by authorId, not stored on the message. */
  avatarUrl?: string;
  uploading: boolean;
  myUid?: string;
  mentionTargets: MentionTarget[];
  onLongPress: () => void;
  onToggleReaction: (emoji: string) => void;
  onPressImage: (urls: string[], index: number) => void;
}) {
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const roleMeta = role ? ROLE_META[role] : null;

  // Pasted GIF/image links (Giphy/Tenor media URLs etc.) render inline; when
  // the message is ONLY the link, skip the text so just the image shows.
  const linkedImages = extractImageUrls(message.content);
  const imageOnly = linkedImages.length === 1 && message.content.trim() === linkedImages[0];

  // Uploaded photos: multi-image grid (mediaUrls) or the single legacy mediaUrl.
  const photoUrls =
    message.mediaUrls && message.mediaUrls.length > 0
      ? message.mediaUrls
      : message.mediaType === "photo" && message.mediaUrl
        ? [message.mediaUrl]
        : [];

  const reactionEntries = Object.entries(message.reactions ?? {}).filter(
    ([, uids]) => uids.length > 0,
  );

  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={300}
      style={[styles.row, isMe ? styles.rowMe : styles.rowThem]}
    >
      {!isMe && (
        <Avatar
          uri={avatarUrl}
          name={message.authorName}
          uid={message.authorId}
          role={role}
          size={32}
        />
      )}
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
        {!!message.pinnedAt && (
          <View style={styles.pinnedRow}>
            <Ionicons name="pin" size={11} color={isMe ? colors.white : colors.ocean} />
            <Text style={[styles.pinnedText, isMe && { color: colors.white }]}>Pinned</Text>
          </View>
        )}

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

        {message.replyTo && (
          <View style={styles.replyQuote}>
            <Text style={styles.replyQuoteName}>{message.replyTo.authorName}</Text>
            <Text style={styles.replyQuoteText} numberOfLines={2}>
              {message.replyTo.preview}
            </Text>
          </View>
        )}

        {photoUrls.length > 0 && (
          <MediaGrid
            urls={photoUrls}
            uploading={uploading}
            onPressImage={(i) => onPressImage(photoUrls, i)}
            onLongPress={onLongPress}
          />
        )}

        {message.mediaType === "video" && message.mediaUrl && (
          <VideoBubble uri={message.mediaUrl} uploading={uploading} />
        )}

        {linkedImages.map((url) => (
          <Pressable
            key={url}
            style={styles.mediaWrap}
            onPress={() => onPressImage([url], 0)}
            onLongPress={onLongPress}
            delayLongPress={300}
          >
            <Image source={{ uri: url }} style={styles.mediaImage} resizeMode="cover" />
          </Pressable>
        ))}

        {message.content.length > 0 && !imageOnly && (
          <LinkifiedText
            text={message.content}
            style={[styles.msgText, isMe && styles.msgTextMe]}
            linkStyle={[styles.msgLink, isMe && styles.msgLinkMe]}
            mentions={mentionTargets}
            mentionStyle={[styles.mention, isMe && styles.mentionMe]}
            selfMentionStyle={isMe ? styles.selfMentionMe : styles.selfMention}
            selfUid={myUid}
          />
        )}

        {reactionEntries.length > 0 && (
          <View style={styles.reactionsRow}>
            {reactionEntries.map(([emoji, uids]) => (
              <Pressable
                key={emoji}
                onPress={() => onToggleReaction(emoji)}
                style={[
                  styles.reactionChip,
                  !!myUid && uids.includes(myUid) && styles.reactionChipMine,
                ]}
              >
                <Text style={styles.reactionChipText}>
                  {emoji} {uids.length}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={[styles.timestamp, isMe && styles.timestampMe]}>{time}</Text>
      </View>
    </Pressable>
  );
}

/**
 * WhatsApp-style photo layout: one image full width; 2+ in a 2-column grid
 * capped at 4 tiles with a "+N" overlay on the last. Tap opens the viewer.
 */
function MediaGrid({
  urls,
  uploading,
  onPressImage,
  onLongPress,
}: {
  urls: string[];
  uploading: boolean;
  onPressImage: (index: number) => void;
  onLongPress: () => void;
}) {
  if (urls.length === 1) {
    return (
      <Pressable
        style={styles.mediaWrap}
        onPress={() => onPressImage(0)}
        onLongPress={onLongPress}
        delayLongPress={300}
      >
        <Image source={{ uri: urls[0] }} style={styles.mediaImage} resizeMode="cover" />
        {uploading && (
          <View style={styles.uploadingOverlay}>
            <ActivityIndicator color={colors.white} />
          </View>
        )}
      </Pressable>
    );
  }

  const shown = urls.slice(0, 4);
  const extra = urls.length - shown.length;
  return (
    <View style={styles.mediaWrap}>
      <View style={styles.gridWrap}>
        {shown.map((u, i) => (
          <Pressable
            key={`${u}-${i}`}
            style={styles.gridTile}
            onPress={() => onPressImage(i)}
            onLongPress={onLongPress}
            delayLongPress={300}
          >
            <Image source={{ uri: u }} style={styles.gridImage} resizeMode="cover" />
            {i === shown.length - 1 && extra > 0 && (
              <View style={styles.gridMore}>
                <Text style={styles.gridMoreText}>+{extra}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>
      {uploading && (
        <View style={styles.uploadingOverlay}>
          <ActivityIndicator color={colors.white} />
        </View>
      )}
    </View>
  );
}

function VideoBubble({ uri, uploading }: { uri: string; uploading: boolean }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = false; });
  const viewRef = useRef<VideoView>(null);
  return (
    <View style={styles.mediaWrap}>
      <VideoView
        ref={viewRef}
        player={player}
        style={styles.mediaImage}
        nativeControls
        fullscreenOptions={{ enable: true }}
      />
      {/* The native fullscreen control is tiny in a 220px bubble, so give it an
          obvious tap target that blows the video up to full screen. */}
      <Pressable
        style={styles.videoExpand}
        onPress={() => void viewRef.current?.enterFullscreen()}
        hitSlop={8}
      >
        <Ionicons name="expand" size={16} color={colors.white} />
      </Pressable>
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
  // Horizontal so an incoming message can sit beside its author's avatar.
  // The bubble shrinks rather than overflowing once the avatar takes its share
  // of a narrow screen.
  row: { marginVertical: 3, flexDirection: "row", alignItems: "flex-end", gap: spacing.xs },
  rowMe: { justifyContent: "flex-end" },
  rowThem: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: BUBBLE_MAX,
    flexShrink: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadow.sm,
  },
  bubbleMe: { backgroundColor: colors.ocean },
  bubbleThem: { backgroundColor: colors.white },
  pinnedRow: { flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 2 },
  pinnedText: { fontSize: 10, fontWeight: type.weight.heavy, color: colors.ocean, letterSpacing: 0.5 },
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
  msgLink: { color: colors.ocean, textDecorationLine: "underline" },
  msgLinkMe: { color: "#BFE0FF", textDecorationLine: "underline" },
  // A mention of someone else is a tinted name; a mention of YOU also gets a
  // filled chip, so being tagged stands out while scrolling a busy channel.
  mention: { color: colors.ocean, fontWeight: type.weight.bold },
  mentionMe: { color: "#BFE0FF", fontWeight: type.weight.bold },
  selfMention: {
    color: colors.oceanDeep,
    fontWeight: type.weight.heavy,
    backgroundColor: "rgba(14,95,165,0.16)",
  },
  selfMentionMe: {
    color: colors.white,
    fontWeight: type.weight.heavy,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  mentionBar: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.bgSoft,
  },
  mentionList: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  mentionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    maxWidth: 180,
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  mentionChipText: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.ink },
  mentionEmpty: {
    fontSize: type.size.sm,
    color: colors.muted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  timestamp: { fontSize: 10, color: colors.muted, marginTop: 2, alignSelf: "flex-end" },
  timestampMe: { color: "rgba(255,255,255,0.65)" },
  mediaWrap: { position: "relative", marginBottom: spacing.xs },
  mediaImage: { width: 220, height: 160, borderRadius: radii.md },
  videoExpand: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.xs,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  gridWrap: { width: 220, flexDirection: "row", flexWrap: "wrap", gap: 4 },
  gridTile: {
    width: 108,
    height: 108,
    borderRadius: radii.sm,
    overflow: "hidden",
    position: "relative",
  },
  gridImage: { width: "100%", height: "100%" },
  gridMore: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  gridMoreText: { color: colors.white, fontSize: type.size.xl, fontWeight: type.weight.heavy },
  reactionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: spacing.xs },
  reactionChip: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.06)",
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "transparent",
  },
  reactionChipMine: { borderColor: colors.ocean, backgroundColor: "rgba(14,95,165,0.12)" },
  reactionChipText: { fontSize: type.size.sm, color: colors.ink },
  replyQuote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.ocean,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  replyQuoteName: { fontSize: type.size.xs, fontWeight: type.weight.bold, color: colors.ocean },
  replyQuoteText: { fontSize: type.size.xs, color: colors.muted, marginTop: 1 },
  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.bgSoft,
  },
  replyBarName: { fontSize: type.size.xs, fontWeight: type.weight.bold, color: colors.ocean },
  replyBarSnippet: { fontSize: type.size.xs, color: colors.muted, marginTop: 1 },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    padding: spacing.lg,
  },
  sheetCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.xl,
    ...shadow.sm,
  },
  emojiRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  emojiBtn: { padding: spacing.xs },
  emojiTxt: { fontSize: 26 },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  sheetRowText: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink },
  viewerBg: { flex: 1, backgroundColor: "#000" },
  viewerPage: { width: SCREEN_W, height: "100%", justifyContent: "center" },
  viewerImage: { width: "100%", height: "100%" },
  // `top` is set inline from the safe-area inset — a Modal is its own native
  // window, so SafeAreaView measures nothing inside it.
  // A dark translucent chip keeps the icons legible over any photo — white
  // glyphs vanished against light images before.
  viewerClose: {
    position: "absolute",
    right: spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerMenuBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
    padding: spacing.lg,
  },
  viewerMenuSheet: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.xl,
    ...shadow.sm,
  },
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
