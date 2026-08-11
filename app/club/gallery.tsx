import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { hashtagRegex, parseHashtags } from "@/models/club";
import type { ClubComment, ClubMember, ClubPost } from "@/models/club";
import { Avatar } from "@/ui/Avatar";
import { colors, radii, spacing, type } from "@/ui/theme";

const SCREEN_W = Dimensions.get("window").width;
const COLUMNS = 3;
const GAP = 2;
const TILE = (SCREEN_W - GAP * (COLUMNS - 1)) / COLUMNS;

type Layout = "feed" | "grid";
/** A single photo, flattened out of its post — a four-photo post is four of these. */
type Tile = { post: ClubPost; url: string };

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
  const [layout, setLayout] = useState<Layout>("feed");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [draft, setDraft] = useState<ImagePicker.ImagePickerAsset[] | null>(null);
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

  const onPickPhotos = async () => {
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
    setDraft(result.assets);
  };

  const onPost = async (
    assets: ImagePicker.ImagePickerAsset[],
    caption: string,
    taggedUids: string[],
  ) => {
    if (!club || !user) return;
    setDraft(null);
    setUploading(true);
    try {
      const post = await createPost(club.id, user.uid, user.displayName ?? "Member", {
        type: "photo",
        content: caption.trim(),
        tags: parseHashtags(caption),
        taggedUids,
      });
      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i]!;
        await uploadPostMedia(
          club.id,
          post.id,
          asset.uri,
          asset.mimeType ?? "image/jpeg",
          // A single photo keeps the plain "media" key; several are numbered so
          // they land in order.
          assets.length === 1 ? "media" : `media-${i}`,
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

  /** Every tag in use, most-used first, for the filter row. */
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of posts) for (const t of p.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [posts]);

  const visiblePosts = useMemo(
    () => (activeTag ? posts.filter((p) => (p.tags ?? []).includes(activeTag)) : posts),
    [posts, activeTag],
  );

  // One tile per photo, not per post: a post carrying four photos should read
  // as four tiles, the way a gallery is expected to.
  const tiles: Tile[] = useMemo(
    () => visiblePosts.flatMap((post) => (post.mediaUrls ?? []).map((url) => ({ post, url }))),
    [visiblePosts],
  );

  const memberFor = useCallback(
    (uid: string) => members.find((m) => m.uid === uid),
    [members],
  );

  if (!club) return null;

  const empty = loaded ? (
    <View style={styles.emptyWrap}>
      <Ionicons name="images-outline" size={44} color={colors.muted} />
      <Text style={styles.emptyTitle}>{activeTag ? "Nothing tagged that" : "No photos yet"}</Text>
      <Text style={styles.emptyText}>
        {activeTag
          ? `No photos are tagged #${activeTag} yet.`
          : "Post the first one — race day, practice, whatever the crew got up to."}
      </Text>
    </View>
  ) : (
    <View style={styles.emptyWrap}>
      <ActivityIndicator color={colors.ocean} />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Toolbar
        layout={layout}
        onChangeLayout={setLayout}
        tags={allTags}
        activeTag={activeTag}
        onChangeTag={setActiveTag}
      />

      {layout === "grid" ? (
        <FlatList
          // Both branches sit at the same position in the tree, so React would
          // reuse one FlatList instance and change numColumns underneath it —
          // which RN throws on. Distinct keys keep them separate components.
          key="grid"
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
          ListEmptyComponent={empty}
        />
      ) : (
        <FlatList
          key="feed"
          data={visiblePosts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: 96 }}
          renderItem={({ item }) => (
            <PhotoCard
              post={item}
              myUid={user?.uid}
              canDelete={item.authorId === user?.uid || isStaff}
              author={memberFor(item.authorId)}
              taggedNames={(item.taggedUids ?? [])
                .map((uid) => memberFor(uid)?.displayName)
                .filter((n): n is string => !!n)}
              onOpenPhoto={(url) => {
                const at = tiles.findIndex((t) => t.post.id === item.id && t.url === url);
                if (at >= 0) setViewerIndex(at);
              }}
              onTagPress={setActiveTag}
              onLike={() => user && void toggleLike(club.id, item.id, user.uid).catch(() => undefined)}
              onDeleted={load}
              clubId={club.id}
            />
          )}
          ListEmptyComponent={empty}
        />
      )}

      <Pressable
        style={[styles.fab, uploading && styles.fabBusy]}
        onPress={onPickPhotos}
        disabled={uploading}
      >
        {uploading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Ionicons name="add" size={30} color={colors.white} />
        )}
      </Pressable>

      {draft && (
        <ComposeSheet
          assets={draft}
          members={members}
          myUid={user?.uid}
          insetTop={insets.top}
          insetBottom={insets.bottom}
          onCancel={() => setDraft(null)}
          onPost={onPost}
        />
      )}

      {viewerIndex !== null && tiles[viewerIndex] && (
        <PhotoViewer
          tiles={tiles}
          index={viewerIndex}
          myUid={user?.uid}
          isStaff={isStaff}
          memberFor={memberFor}
          onTagPress={(tag) => {
            setViewerIndex(null);
            setActiveTag(tag);
          }}
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

// ── Toolbar ──────────────────────────────────────────────────────────────────

function Toolbar({
  layout,
  onChangeLayout,
  tags,
  activeTag,
  onChangeTag,
}: {
  layout: Layout;
  onChangeLayout: (l: Layout) => void;
  tags: string[];
  activeTag: string | null;
  onChangeTag: (t: string | null) => void;
}) {
  return (
    <View style={styles.toolbar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tagRow}
      >
        <Pressable
          onPress={() => onChangeTag(null)}
          style={[styles.tagChip, !activeTag && styles.tagChipOn]}
        >
          <Text style={[styles.tagChipText, !activeTag && styles.tagChipTextOn]}>All</Text>
        </Pressable>
        {tags.map((t) => (
          <Pressable
            key={t}
            onPress={() => onChangeTag(activeTag === t ? null : t)}
            style={[styles.tagChip, activeTag === t && styles.tagChipOn]}
          >
            <Text style={[styles.tagChipText, activeTag === t && styles.tagChipTextOn]}>#{t}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.layoutToggle}>
        {(["feed", "grid"] as const).map((l) => (
          <Pressable
            key={l}
            onPress={() => onChangeLayout(l)}
            style={[styles.layoutBtn, layout === l && styles.layoutBtnOn]}
            hitSlop={6}
          >
            <Ionicons
              name={l === "feed" ? "square-outline" : "grid-outline"}
              size={18}
              color={layout === l ? colors.white : colors.muted}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ── Caption with tappable hashtags ───────────────────────────────────────────

function Caption({
  text,
  onTagPress,
  style,
}: {
  text: string;
  onTagPress: (tag: string) => void;
  style?: object;
}) {
  // Split around hashtags so each one can carry its own press handler.
  const parts: { text: string; tag?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(hashtagRegex())) {
    const at = m.index!;
    if (at > last) parts.push({ text: text.slice(last, at) });
    parts.push({ text: m[0], tag: m[1]!.toLowerCase() });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });

  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.tag ? (
          <Text key={i} style={styles.hashtag} onPress={() => onTagPress(p.tag!)}>
            {p.text}
          </Text>
        ) : (
          <Text key={i}>{p.text}</Text>
        ),
      )}
    </Text>
  );
}

// ── Feed card ────────────────────────────────────────────────────────────────

/**
 * One post as a full-width card. Photos are square and cropped to fill, which
 * is what makes a mixed-orientation gallery read as a single column instead of
 * a ragged one.
 */
function PhotoCard({
  post,
  myUid,
  canDelete,
  author,
  taggedNames,
  clubId,
  onOpenPhoto,
  onTagPress,
  onLike,
  onDeleted,
}: {
  post: ClubPost;
  myUid?: string;
  canDelete: boolean;
  author?: ClubMember;
  taggedNames: string[];
  clubId: string;
  onOpenPhoto: (url: string) => void;
  onTagPress: (tag: string) => void;
  onLike: () => void;
  onDeleted: () => void;
}) {
  const urls = post.mediaUrls ?? [];
  const [liked, setLiked] = useState(!!myUid && (post.likedBy ?? []).includes(myUid));
  const [likeCount, setLikeCount] = useState(post.likeCount ?? 0);
  const [page, setPage] = useState(0);

  // The card keeps its key across a reload, so the initial state above only
  // runs once — resync when the server's counts come back.
  useEffect(() => {
    setLiked(!!myUid && (post.likedBy ?? []).includes(myUid));
    setLikeCount(post.likeCount ?? 0);
  }, [post.likeCount, post.likedBy, myUid]);

  const onToggleLike = () => {
    if (!myUid) return;
    // Optimistic; the next load reconciles.
    setLiked((v) => !v);
    setLikeCount((n) => n + (liked ? -1 : 1));
    onLike();
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

  if (urls.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Avatar uri={author?.avatarUrl} name={post.authorName} uid={post.authorId} size={34} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.cardAuthor} numberOfLines={1}>
            {post.authorName}
          </Text>
          <Text style={styles.cardDate}>{new Date(post.createdAt).toLocaleDateString()}</Text>
        </View>
        {canDelete && (
          <Pressable onPress={onDelete} hitSlop={12} style={styles.cardMenu}>
            <Ionicons name="trash-outline" size={20} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {urls.length === 1 ? (
        <Pressable onPress={() => onOpenPhoto(urls[0]!)}>
          <Image source={{ uri: urls[0]! }} style={styles.cardImage} />
        </Pressable>
      ) : (
        <>
          <FlatList
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={urls}
            keyExtractor={(u, i) => `${post.id}-${i}`}
            onMomentumScrollEnd={(e) =>
              setPage(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))
            }
            renderItem={({ item }) => (
              <Pressable onPress={() => onOpenPhoto(item)}>
                <Image source={{ uri: item }} style={styles.cardImage} />
              </Pressable>
            )}
          />
          <View style={styles.dots}>
            {urls.map((_, i) => (
              <View key={i} style={[styles.dot, i === page && styles.dotOn]} />
            ))}
          </View>
        </>
      )}

      <View style={styles.cardBody}>
        <View style={styles.cardActions}>
          <Pressable onPress={onToggleLike} style={styles.action} hitSlop={8}>
            <Ionicons
              name={liked ? "heart" : "heart-outline"}
              size={26}
              color={liked ? colors.coral : colors.ink}
            />
          </Pressable>
          <Pressable onPress={() => onOpenPhoto(urls[0]!)} style={styles.action} hitSlop={8}>
            <Ionicons name="chatbubble-outline" size={23} color={colors.ink} />
          </Pressable>
        </View>

        {likeCount > 0 && (
          <Text style={styles.likeLine}>
            {likeCount} like{likeCount === 1 ? "" : "s"}
          </Text>
        )}

        {post.content.trim().length > 0 && (
          <Caption text={post.content} onTagPress={onTagPress} style={styles.cardCaption} />
        )}

        {taggedNames.length > 0 && (
          <Text style={styles.taggedLine} numberOfLines={2}>
            <Ionicons name="people-outline" size={12} color={colors.muted} />{" "}
            {taggedNames.join(", ")}
          </Text>
        )}

        {(post.commentCount ?? 0) > 0 && (
          <Pressable onPress={() => onOpenPhoto(urls[0]!)}>
            <Text style={styles.viewComments}>
              View {post.commentCount === 1 ? "1 comment" : `all ${post.commentCount} comments`}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ── Compose ──────────────────────────────────────────────────────────────────

/** Caption + people tagging, between picking photos and uploading them. */
function ComposeSheet({
  assets,
  members,
  myUid,
  insetTop,
  insetBottom,
  onCancel,
  onPost,
}: {
  assets: ImagePicker.ImagePickerAsset[];
  members: ClubMember[];
  myUid?: string;
  insetTop: number;
  insetBottom: number;
  onCancel: () => void;
  onPost: (
    assets: ImagePicker.ImagePickerAsset[],
    caption: string,
    taggedUids: string[],
  ) => void;
}) {
  const [caption, setCaption] = useState("");
  const [tagged, setTagged] = useState<string[]>([]);
  const others = members.filter((m) => m.uid !== myUid);

  const toggle = (uid: string) =>
    setTagged((cur) => (cur.includes(uid) ? cur.filter((u) => u !== uid) : [...cur, uid]));

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View
        style={[
          styles.composeRoot,
          { paddingTop: Math.max(insetTop, spacing.sm), paddingBottom: insetBottom },
        ]}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.composeHeader}>
            <Pressable onPress={onCancel} hitSlop={16} style={styles.headerBtn}>
              <Ionicons name="close" size={26} color={colors.ink} />
            </Pressable>
            <Text style={styles.composeTitle}>New post</Text>
            <Pressable
              onPress={() => onPost(assets, caption, tagged)}
              hitSlop={16}
              style={styles.headerBtn}
            >
              <Text style={styles.postBtn}>Post</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.previewRow}
            >
              {assets.map((a, i) => (
                <Image key={i} source={{ uri: a.uri }} style={styles.preview} />
              ))}
            </ScrollView>

            <TextInput
              style={styles.captionInput}
              value={caption}
              onChangeText={setCaption}
              placeholder="Write a caption… #raceday"
              placeholderTextColor={colors.muted}
              multiline
              maxLength={1000}
            />
            <Text style={styles.hint}>
              Hashtags in the caption become filters everyone can tap.
            </Text>

            {others.length > 0 && (
              <View style={styles.tagPeople}>
                <Text style={styles.sectionLabel}>
                  Tag people{tagged.length > 0 ? ` · ${tagged.length}` : ""}
                </Text>
                <View style={styles.peopleWrap}>
                  {others.map((m) => {
                    const on = tagged.includes(m.uid);
                    return (
                      <Pressable
                        key={m.uid}
                        onPress={() => toggle(m.uid)}
                        style={[styles.personChip, on && styles.personChipOn]}
                      >
                        <Avatar uri={m.avatarUrl} name={m.displayName} uid={m.uid} size={22} />
                        <Text style={[styles.personName, on && styles.personNameOn]}>
                          {m.displayName}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── Full-screen viewer ───────────────────────────────────────────────────────

function PhotoViewer({
  tiles,
  index,
  myUid,
  isStaff,
  clubId,
  memberFor,
  onTagPress,
  onClose,
  onChangeIndex,
  onDeleted,
  insetTop,
  insetBottom,
}: {
  tiles: Tile[];
  index: number;
  myUid?: string;
  isStaff: boolean;
  clubId: string;
  memberFor: (uid: string) => ClubMember | undefined;
  onTagPress: (tag: string) => void;
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
  const taggedNames = (post.taggedUids ?? [])
    .map((uid) => memberFor(uid)?.displayName)
    .filter((n): n is string => !!n);

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
                uri={memberFor(post.authorId)?.avatarUrl}
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
              <Caption text={post.content} onTagPress={onTagPress} style={styles.caption} />
            )}

            {taggedNames.length > 0 && (
              <Text style={styles.taggedLineDark} numberOfLines={2}>
                <Ionicons name="people-outline" size={12} color={colors.muted} />{" "}
                {taggedNames.join(", ")}
              </Text>
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

  // Toolbar
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  tagRow: { gap: 6, alignItems: "center", paddingRight: spacing.sm },
  tagChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.bg,
  },
  tagChipOn: { backgroundColor: colors.ocean },
  tagChipText: { fontSize: type.size.xs, color: colors.muted, fontWeight: type.weight.medium },
  tagChipTextOn: { color: colors.white },
  layoutToggle: { flexDirection: "row", borderRadius: radii.md, overflow: "hidden" },
  layoutBtn: { padding: 6, backgroundColor: colors.bg },
  layoutBtnOn: { backgroundColor: colors.ocean },

  // Feed card
  card: { backgroundColor: colors.card, marginBottom: spacing.sm },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cardAuthor: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink },
  cardDate: { fontSize: type.size.xs, color: colors.muted },
  cardMenu: { padding: 4 },
  cardImage: { width: SCREEN_W, height: SCREEN_W, backgroundColor: colors.line },
  dots: { flexDirection: "row", justifyContent: "center", gap: 5, paddingTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.line },
  dotOn: { backgroundColor: colors.ocean },
  cardBody: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 5 },
  cardActions: { flexDirection: "row", gap: spacing.lg, alignItems: "center" },
  likeLine: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.ink },
  cardCaption: { fontSize: type.size.sm, color: colors.ink, lineHeight: 20 },
  hashtag: { color: colors.ocean, fontWeight: type.weight.medium },
  taggedLine: { fontSize: type.size.xs, color: colors.muted },
  taggedLineDark: { fontSize: type.size.xs, color: colors.muted },
  viewComments: { fontSize: type.size.sm, color: colors.muted },

  // Compose
  composeRoot: { flex: 1, backgroundColor: colors.card },
  composeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  composeTitle: { fontSize: type.size.lg, fontWeight: type.weight.bold, color: colors.ink },
  postBtn: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ocean },
  previewRow: { gap: spacing.sm, padding: spacing.md },
  preview: { width: 96, height: 96, borderRadius: radii.md, backgroundColor: colors.line },
  captionInput: {
    minHeight: 90,
    marginHorizontal: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    color: colors.ink,
    fontSize: type.size.md,
    textAlignVertical: "top",
  },
  hint: {
    marginHorizontal: spacing.md,
    marginTop: 6,
    fontSize: type.size.xs,
    color: colors.muted,
  },
  tagPeople: { padding: spacing.md, gap: spacing.sm },
  sectionLabel: {
    fontSize: type.size.xs,
    fontWeight: type.weight.bold,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  peopleWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  personChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.bg,
  },
  personChipOn: { backgroundColor: colors.ocean },
  personName: { fontSize: type.size.sm, color: colors.ink },
  personNameOn: { color: colors.white, fontWeight: type.weight.medium },

  // Viewer
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
