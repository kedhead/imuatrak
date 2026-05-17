import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useClub } from "@/services/clubStore";
import { getPosts, createPost, getUpcomingEvents } from "@/services/clubService";
import { currentUser } from "@/services/auth";
import type { ClubPost, ClubEvent } from "@/models/club";
import { colors, spacing, radii } from "@/ui/theme";

export default function ClubTab() {
  const club = useClub((s) => s.club);
  const loaded = useClub((s) => s.loaded);

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.blue} />
      </View>
    );
  }

  if (!club) {
    return <NoClubScreen />;
  }

  return <ClubHomeScreen clubId={club.id} clubName={club.name} />;
}

// ── No-club empty state ───────────────────────────────────────────────────────

function NoClubScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.center}>
      <Ionicons name="people-outline" size={64} color={colors.muted} />
      <Text style={styles.emptyTitle}>No club yet</Text>
      <Text style={styles.emptySubtitle}>Create a club or join one with an invite link.</Text>
      <Pressable style={styles.btn} onPress={() => router.push("/club/create")}>
        <Text style={styles.btnText}>Create a club</Text>
      </Pressable>
      <Pressable style={[styles.btn, styles.btnOutline]} onPress={() => router.push("/club/join")}>
        <Text style={[styles.btnText, { color: colors.blue }]}>Join with invite code</Text>
      </Pressable>
    </SafeAreaView>
  );
}

// ── Club home (feed + events) ─────────────────────────────────────────────────

function ClubHomeScreen({ clubId, clubName }: { clubId: string; clubName: string }) {
  const router = useRouter();
  const role = useClub((s) => s.role);
  const [posts, setPosts] = useState<ClubPost[]>([]);
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [postText, setPostText] = useState("");
  const [posting, setPosting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [p, e] = await Promise.all([getPosts(clubId), getUpcomingEvents(clubId, 3)]);
      setPosts(p);
      setEvents(e);
    };
    void load();
  }, [clubId]);

  const handlePost = async () => {
    const content = postText.trim();
    if (!content) return;
    const user = currentUser();
    if (!user) return;
    setPosting(true);
    try {
      const post = await createPost(clubId, user.uid, user.displayName ?? "Member", {
        type: "post",
        content,
      });
      setPosts((prev) => [post, ...prev]);
      setPostText("");
    } finally {
      setPosting(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    const [p, e] = await Promise.all([getPosts(clubId), getUpcomingEvents(clubId, 3)]);
    setPosts(p);
    setEvents(e);
    setRefreshing(false);
  };

  const isAdmin = role === "owner" || role === "admin";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.clubName}>{clubName}</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Pressable onPress={() => router.push("/club/members")}>
            <Ionicons name="people-outline" size={24} color={colors.blue} />
          </Pressable>
          {isAdmin && (
            <Pressable onPress={() => router.push("/club/admin/index")}>
              <Ionicons name="settings-outline" size={24} color={colors.blue} />
            </Pressable>
          )}
        </View>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        ListHeaderComponent={
          <>
            {/* Upcoming events strip */}
            {events.length > 0 && (
              <View style={styles.eventsStrip}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionLabel}>UPCOMING</Text>
                  <Pressable onPress={() => router.push("/club/events" as never)}>
                    <Text style={styles.seeAll}>See all</Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {events.map((e) => (
                    <EventCard key={e.id} event={e} onPress={() => router.push(`/club/event/${e.id}` as never)} />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Post composer */}
            <View style={styles.composer}>
              <TextInput
                style={styles.composerInput}
                placeholder="Share something with the club…"
                placeholderTextColor={colors.muted}
                value={postText}
                onChangeText={setPostText}
                multiline
                maxLength={2000}
              />
              {postText.trim().length > 0 && (
                <Pressable
                  style={[styles.postBtn, posting && { opacity: 0.5 }]}
                  onPress={handlePost}
                  disabled={posting}
                >
                  {posting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.postBtnText}>Post</Text>
                  )}
                </Pressable>
              )}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>FEED</Text>
            </View>
          </>
        }
        renderItem={({ item }) => <PostCard post={item} />}
        ListEmptyComponent={
          <Text style={styles.emptyFeed}>No posts yet. Be the first to share something!</Text>
        }
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
      />
    </SafeAreaView>
  );
}

// ── Event card (horizontal scroll) ───────────────────────────────────────────

function EventCard({ event, onPress }: { event: ClubEvent; onPress: () => void }) {
  const date = new Date(event.startAt);
  const day = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const typeColors: Record<string, string> = {
    practice: colors.blue,
    race: "#B22222",
    social: colors.teal,
  };
  return (
    <Pressable style={styles.eventCard} onPress={onPress}>
      <View style={[styles.eventType, { backgroundColor: typeColors[event.type] ?? colors.blue }]}>
        <Text style={styles.eventTypeText}>{event.type.toUpperCase()}</Text>
      </View>
      <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
      <Text style={styles.eventDate}>{day}</Text>
    </Pressable>
  );
}

// ── Post card ────────────────────────────────────────────────────────────────

function PostCard({ post }: { post: ClubPost }) {
  const date = new Date(post.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const isPinned = post.type === "announcement";
  return (
    <View style={styles.postCard}>
      {isPinned && (
        <View style={styles.pinnedBadge}>
          <Ionicons name="megaphone-outline" size={12} color={colors.blue} />
          <Text style={styles.pinnedText}>Announcement</Text>
        </View>
      )}
      <View style={styles.postMeta}>
        <Text style={styles.postAuthor}>{post.authorName}</Text>
        <Text style={styles.postDate}>{date}</Text>
      </View>
      <Text style={styles.postContent}>{post.content}</Text>
      {post.commentCount > 0 && (
        <Text style={styles.postComments}>{post.commentCount} comment{post.commentCount !== 1 ? "s" : ""}</Text>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md, padding: spacing.xl, backgroundColor: colors.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: "#E5E9EF" },
  clubName: { fontSize: 20, fontWeight: "700", color: colors.ink },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.ink, marginTop: spacing.lg },
  emptySubtitle: { fontSize: 15, color: colors.muted, textAlign: "center" },
  btn: { backgroundColor: colors.blue, borderRadius: radii.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, marginTop: spacing.sm },
  btnOutline: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.blue },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  eventsStrip: { paddingTop: spacing.md },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: colors.muted, letterSpacing: 1.2 },
  seeAll: { fontSize: 13, color: colors.blue, fontWeight: "600" },
  eventCard: { width: 160, backgroundColor: colors.card, borderRadius: radii.md, marginLeft: spacing.lg, padding: spacing.md, marginBottom: spacing.md },
  eventType: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start", marginBottom: spacing.xs },
  eventTypeText: { fontSize: 9, fontWeight: "800", color: "#fff", letterSpacing: 1 },
  eventTitle: { fontSize: 14, fontWeight: "600", color: colors.ink, marginTop: spacing.xs },
  eventDate: { fontSize: 12, color: colors.muted, marginTop: spacing.xs },
  composer: { margin: spacing.lg, backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.md },
  composerInput: { fontSize: 15, color: colors.ink, minHeight: 60 },
  postBtn: { backgroundColor: colors.blue, borderRadius: radii.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, alignSelf: "flex-end", marginTop: spacing.sm },
  postBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  postCard: { backgroundColor: colors.card, marginHorizontal: spacing.lg, marginBottom: spacing.sm, borderRadius: radii.md, padding: spacing.md },
  pinnedBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: spacing.xs },
  pinnedText: { fontSize: 11, fontWeight: "700", color: colors.blue, letterSpacing: 0.5 },
  postMeta: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.xs },
  postAuthor: { fontSize: 13, fontWeight: "700", color: colors.ink },
  postDate: { fontSize: 12, color: colors.muted },
  postContent: { fontSize: 15, color: colors.ink, lineHeight: 22 },
  postComments: { fontSize: 12, color: colors.muted, marginTop: spacing.sm },
  emptyFeed: { textAlign: "center", color: colors.muted, marginTop: spacing.xl, paddingHorizontal: spacing.xl },
});
