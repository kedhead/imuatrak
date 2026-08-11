import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useState } from "react";
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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { currentUser } from "@/services/auth";
import {
  addComment,
  createPost,
  deletePost,
  getComments,
  getGalleryPosts,
  toggleLike,
  uploadPostMedia,
} from "@/services/clubService";
import { useClub } from "@/services/clubStore";
import type { ClubComment, ClubPost } from "@/models/club";
import { Avatar } from "@/ui/Avatar";
import { colors, radii, spacing, type } from "@/ui/theme";

const SCREEN_W = Dimensions.get("window").width;
const COLUMNS = 3;
const GAP = 2;
const TILE = (SCREEN_W - GAP * (COLUMNS - 1)) / COLUMNS;

/**
 * Club photo gallery.
 *
 * Photo posts live in the same collection as the Team Updates feed, so likes,
 * comments and moderation come from the existing post services unchanged — see
 * the PostType comment in models/club.ts.
 */
export default function GalleryScreen() {
  const club = useClub((s) => s.club);
  const members = useClub((s) => s.members);
  const role = useClub((s) => s.role);
  const user = currentUser();
  // Read here rather than inside the viewer: the viewer renders in a Modal,
  // which is its own native window, and SafeAreaView measures nothing there —
  // the header ended up under the status bar with the close button untappable.
  const insets = useSafeAreaInsets();

  const [posts, setPosts] = useState<ClubPost[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const isStaff = role === "owner" || role === "admin";

  const load = useCallback(async () => {
    if (!club) return;
    try {
      setPosts(await getGalleryPosts(club.id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Couldn't load the gallery", msg);
    } finally {
      setLoaded(true);
    }
  }, [club?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onAddPhotos = async () => {
    if (!club || !user || uploading) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access to post photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 8,
      // Keeps each upload inside the ~7 MB the Cloud Function accepts.
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;

    setUploading(true);
    try {
      const post = await createPost(club.id, user.uid, user.displayName ?? "Member", {
        type: "photo",
        content: "",
      });
      for (let i = 0; i < result.assets.length; i++) {
        const asset = result.assets[i]!;
        await uploadPostMedia(
          club.id,
          post.id,
          asset.uri,
          asset.mimeType ?? "image/jpeg",
          // A single photo keeps the plain "media" key; several are numbered so
          // they land in order.
          result.assets.length === 1 ? "media" : `media-${i}`,
        );
      }
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Upload failed", msg);
    } finally {
      setUploading(false);
    }
  };

  // One tile per photo, not per post: a post carrying four photos should read
  // as four tiles, the way a gallery is expected to.
  const tiles = posts.flatMap((post) =>
    (post.mediaUrls ?? []).map((url) => ({ post, url })),
  );

  if (!club) return null;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <FlatList
        data={tiles}
        keyExtractor={(t, i) => `${t.post.id}-${i}`}
        numColumns={COLUMNS}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ gap: GAP }}
        renderItem={({ item, index }) => (
          <Pressable onPress={() => setViewerIndex(index)}>
            <Image source={{ uri: item.url }} style={styles.tile} />
          </Pressable>
        )}
        ListEmptyComponent={
          loaded ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="images-outline" size={44} color={colors.muted} />
              <Text style={styles.emptyTitle}>No photos yet</Text>
              <Text style={styles.emptyText}>
                Post the first one — race day, practice, whatever the crew got up to.
              </Text>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <ActivityIndicator color={colors.ocean} />
            </View>
          )
        }
      />

      <Pressable
        style={[styles.fab, uploading && styles.fabBusy]}
        onPress={onAddPhotos}
        disabled={uploading}
      >
        {uploading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Ionicons name="add" size={30} color={colors.white} />
        )}
      </Pressable>

      {viewerIndex !== null && tiles[viewerIndex] && (
        <PhotoViewer
          tiles={tiles}
          index={viewerIndex}
          myUid={user?.uid}
          isStaff={isStaff}
          avatarFor={(uid) => members.find((m) => m.uid === uid)?.avatarUrl}
          onClose={() => setViewerIndex(null)}
          onChangeIndex={setViewerIndex}
          onDeleted={async () => {
            setViewerIndex(null);
            await load();
          }}
          clubId={club.id}
          insetTop={insets.top}
          insetBottom={insets.bottom}
        />
      )}
    </SafeAreaView>
  );
}

function PhotoViewer({
  tiles,
  index,
  myUid,
  isStaff,
  clubId,
  avatarFor,
  onClose,
  onChangeIndex,
  onDeleted,
  insetTop,
  insetBottom,
}: {
  tiles: { post: ClubPost; url: string }[];
  index: number;
  myUid?: string;
  isStaff: boolean;
  clubId: string;
  avatarFor: (uid: string) => string | undefined;
  onClose: () => void;
  onChangeIndex: (i: number) => void;
  onDeleted: () => void;
  insetTop: number;
  insetBottom: number;
}) {
  const tile = tiles[index]!;
  const post = tile.post;
  const [liked, setLiked] = useState(!!myUid && (post.likedBy ?? []).includes(myUid));
  const [likeCount, setLikeCount] = useState(post.likeCount ?? 0);
  const [comments, setComments] = useState<ClubComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [showComments, setShowComments] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    setLiked(!!myUid && (post.likedBy ?? []).includes(myUid));
    setLikeCount(post.likeCount ?? 0);
    setComments([]);
    setShowComments(false);
  }, [post.id, myUid]);

  const onToggleLike = () => {
    if (!myUid) return;
    // Optimistic; the next load reconciles.
    setLiked((v) => !v);
    setLikeCount((n) => n + (liked ? -1 : 1));
    void toggleLike(clubId, post.id, myUid).catch(() => undefined);
  };

  const onOpenComments = async () => {
    setShowComments(true);
    try {
      setComments(await getComments(clubId, post.id));
    } catch {
      // Non-critical — the sheet just stays empty.
    }
  };

  const onSend = async () => {
    const content = commentText.trim();
    if (!content || !myUid) return;
    setCommentText("");
    try {
      await addComment(clubId, post.id, myUid, "Member", content);
      setComments(await getComments(clubId, post.id));
    } catch {
      Alert.alert("Couldn't post that comment", "Please try again.");
    }
  };

  /**
   * Hand the photo to the OS share sheet, which is where Instagram and
   * Facebook appear. shareAsync needs a local file, and gallery photos are
   * remote URLs, so download to the cache first.
   */
  const onShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Sharing unavailable", "This device can't share files.");
        return;
      }
      const target = `${FileSystem.cacheDirectory}imuatrak-share-${post.id}-${index}.jpg`;
      const { uri } = await FileSystem.downloadAsync(tile.url, target);
      await Sharing.shareAsync(uri, { mimeType: "image/jpeg", UTI: "public.jpeg" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Couldn't share", msg);
    } finally {
      setSharing(false);
    }
  };

  const onDelete = () => {
    Alert.alert("Delete photo?", "This removes the whole post. It can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deletePost(clubId, post.id);
            onDeleted();
          } catch {
            Alert.alert("Couldn't delete", "Please try again.");
          }
        },
      },
    ]);
  };

  const canDelete = post.authorId === myUid || isStaff;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View
        style={[
          styles.viewerSafe,
          // Insets come from the parent screen, applied once by hand. A
          // SafeAreaView here reports zero inside the Modal's own window.
          { paddingTop: Math.max(insetTop, spacing.sm), paddingBottom: insetBottom },
        ]}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.viewerHeader}>
            <Pressable onPress={onClose} hitSlop={16} style={styles.headerBtn}>
              <Ionicons name="close" size={28} color={colors.white} />
            </Pressable>
            <Text style={styles.viewerCount}>
              {index + 1} / {tiles.length}
            </Text>
            {canDelete ? (
              <Pressable onPress={onDelete} hitSlop={16} style={styles.headerBtn}>
                <Ionicons name="trash-outline" size={24} color={colors.white} />
              </Pressable>
            ) : (
              <View style={{ width: 44 }} />
            )}
          </View>

          <FlatList
            horizontal
            pagingEnabled
            data={tiles}
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
            keyExtractor={(t, i) => `v-${t.post.id}-${i}`}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) =>
              onChangeIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))
            }
            renderItem={({ item }) => (
              <View style={styles.viewerPage}>
                <Image source={{ uri: item.url }} style={styles.viewerImage} resizeMode="contain" />
              </View>
            )}
          />

          <View style={styles.viewerFooter}>
            <View style={styles.authorRow}>
              <Avatar
                uri={avatarFor(post.authorId)}
                name={post.authorName}
                uid={post.authorId}
                size={30}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.authorName}>{post.authorName}</Text>
                <Text style={styles.postedAt}>
                  {new Date(post.createdAt).toLocaleDateString()}
                </Text>
              </View>
            </View>

            {post.content.trim().length > 0 && (
              <Text style={styles.caption}>{post.content}</Text>
            )}

            <View style={styles.actionRow}>
              <Pressable onPress={onToggleLike} style={styles.action} hitSlop={8}>
                <Ionicons
                  name={liked ? "heart" : "heart-outline"}
                  size={24}
                  color={liked ? colors.coral : colors.white}
                />
                <Text style={styles.actionText}>{likeCount}</Text>
              </Pressable>
              <Pressable onPress={onOpenComments} style={styles.action} hitSlop={8}>
                <Ionicons name="chatbubble-outline" size={22} color={colors.white} />
                <Text style={styles.actionText}>{post.commentCount ?? 0}</Text>
              </Pressable>
              <Pressable onPress={onShare} style={styles.action} hitSlop={8} disabled={sharing}>
                {sharing ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Ionicons name="share-outline" size={22} color={colors.white} />
                )}
              </Pressable>
            </View>

            {showComments && (
              <View style={styles.commentsWrap}>
                <ScrollView style={{ maxHeight: 140 }}>
                  {comments.length === 0 ? (
                    <Text style={styles.noComments}>No comments yet.</Text>
                  ) : (
                    comments.map((c) => (
                      <View key={c.id} style={styles.commentRow}>
                        <Text style={styles.commentAuthor}>{c.authorName}</Text>
                        <Text style={styles.commentText}>{c.content}</Text>
                      </View>
                    ))
                  )}
                </ScrollView>
                <View style={styles.commentComposer}>
                  <TextInput
                    style={styles.commentInput}
                    value={commentText}
                    onChangeText={setCommentText}
                    placeholder="Add a comment…"
                    placeholderTextColor={colors.muted}
                    maxLength={500}
                  />
                  <Pressable onPress={onSend} disabled={!commentText.trim()} hitSlop={8}>
                    <Ionicons
                      name="send"
                      size={20}
                      color={commentText.trim() ? colors.aqua : colors.muted}
                    />
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  tile: { width: TILE, height: TILE, backgroundColor: colors.line },
  emptyWrap: { padding: spacing.xl, alignItems: "center", gap: spacing.sm, marginTop: spacing.xl },
  emptyTitle: { fontSize: type.size.lg, fontWeight: type.weight.bold, color: colors.ink },
  emptyText: { fontSize: type.size.sm, color: colors.muted, textAlign: "center", lineHeight: 20 },
  fab: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.ocean,
    alignItems: "center",
    justifyContent: "center",
  },
  fabBusy: { opacity: 0.7 },

  viewerSafe: { flex: 1, backgroundColor: "#000" },
  viewerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  // 44pt minimum touch target, per the platform guidelines.
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  viewerCount: { color: colors.white, fontSize: type.size.sm },
  viewerPage: { width: SCREEN_W, flex: 1, alignItems: "center", justifyContent: "center" },
  viewerImage: { width: SCREEN_W, height: "100%" },
  viewerFooter: { padding: spacing.lg, gap: spacing.sm },
  authorRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  authorName: { color: colors.white, fontWeight: type.weight.bold, fontSize: type.size.md },
  postedAt: { color: colors.muted, fontSize: type.size.xs },
  caption: { color: colors.white, fontSize: type.size.sm, lineHeight: 20 },
  actionRow: { flexDirection: "row", gap: spacing.lg, alignItems: "center" },
  action: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionText: { color: colors.white, fontSize: type.size.sm },
  commentsWrap: { borderTopWidth: 1, borderTopColor: "#222", paddingTop: spacing.sm, gap: spacing.xs },
  noComments: { color: colors.muted, fontSize: type.size.sm },
  commentRow: { marginBottom: spacing.xs },
  commentAuthor: { color: colors.white, fontWeight: type.weight.bold, fontSize: type.size.xs },
  commentText: { color: "#ddd", fontSize: type.size.sm },
  commentComposer: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  commentInput: {
    flex: 1,
    backgroundColor: "#151515",
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    color: colors.white,
    fontSize: type.size.sm,
  },
});
