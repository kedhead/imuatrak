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
import Animated, { FadeInDown } from "react-native-reanimated";
import { useClub } from "@/services/clubStore";
import { getPosts, createPost, getUpcomingEvents } from "@/services/clubService";
import { currentUser } from "@/services/auth";
import type { ClubPost, ClubEvent } from "@/models/club";
import { AnimatedPressable } from "@/ui/AnimatedPressable";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { Gradient } from "@/ui/Gradient";
import { GradientCard } from "@/ui/GradientCard";
import { GradientHeader } from "@/ui/GradientHeader";
import { Logo } from "@/ui/Logo";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, radii, shadow, spacing, type } from "@/ui/theme";

const EVENT_COLORS: Record<string, string> = {
  practice: colors.ocean,
  race: colors.coral,
  social: colors.teal,
};

export default function ClubTab() {
  const club = useClub((s) => s.club);
  const loaded = useClub((s) => s.loaded);

  if (!loaded) {
    return (
      <ScreenBackground>
        <View style={styles.center}>
          <ActivityIndicator color={colors.ocean} />
        </View>
      </ScreenBackground>
    );
  }

  if (!club) return <NoClubScreen />;
  return <ClubHomeScreen clubId={club.id} clubName={club.name} />;
}

// ── No-club empty state ───────────────────────────────────────────────────────

function NoClubScreen() {
  const router = useRouter();
  return (
    <ScreenBackground gradient="ocean">
      <View style={styles.center}>
        <View style={styles.emptyLogo}>
          <Logo size={96} />
        </View>
        <Text style={styles.emptyTitle}>Find your crew</Text>
        <Text style={styles.emptySubtitle}>Create a club or join one with an invite link.</Text>
        <View style={styles.emptyActions}>
          <Button title="Create a club" gradient="sunrise" glow onPress={() => router.push("/club/create")} />
          <Button
            title="Join with invite code"
            variant="outline"
            onPress={() => router.push("/club/join")}
            style={styles.joinBtn}
          />
        </View>
      </View>
    </ScreenBackground>
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
    <ScreenBackground>
      <GradientHeader
        title={clubName}
        subtitle="Your paddling crew"
        right={
          <>
            <Pressable onPress={() => router.push("/club/members")} hitSlop={8}>
              <Ionicons name="people" size={24} color={colors.white} />
            </Pressable>
            {isAdmin && (
              <Pressable onPress={() => router.push("/club/admin")} hitSlop={8}>
                <Ionicons name="settings-sharp" size={22} color={colors.white} />
              </Pressable>
            )}
          </>
        }
      />

      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        contentContainerStyle={{ paddingBottom: 120 }}
        ListHeaderComponent={
          <>
            {events.length > 0 && (
              <View style={styles.eventsStrip}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionLabel}>UPCOMING</Text>
                  <Pressable onPress={() => router.push("/club/events" as never)}>
                    <Text style={styles.seeAll}>See all</Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: spacing.lg }}>
                  {events.map((e) => (
                    <EventCard key={e.id} event={e} onPress={() => router.push(`/club/event/${e.id}` as never)} />
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.composerWrap}>
              <GradientCard padded>
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
                  <Button
                    title={posting ? "Posting…" : "Post"}
                    gradient="aqua"
                    onPress={handlePost}
                    disabled={posting}
                    style={styles.postBtn}
                  />
                )}
              </GradientCard>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>FEED</Text>
            </View>
          </>
        }
        renderItem={({ item, index }) => <PostCard post={item} index={index} />}
        ListEmptyComponent={
          <Text style={styles.emptyFeed}>No posts yet. Be the first to share something!</Text>
        }
      />
    </ScreenBackground>
  );
}

// ── Event card (horizontal scroll) ───────────────────────────────────────────

function EventCard({ event, onPress }: { event: ClubEvent; onPress: () => void }) {
  const date = new Date(event.startAt);
  const day = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const color = EVENT_COLORS[event.type] ?? colors.ocean;
  return (
    <AnimatedPressable onPress={onPress} style={styles.eventCard}>
      <Badge label={event.type} color={color} />
      <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
      <View style={styles.eventDateRow}>
        <Ionicons name="calendar-outline" size={13} color={colors.muted} />
        <Text style={styles.eventDate}>{day}</Text>
      </View>
    </AnimatedPressable>
  );
}

// ── Post card ────────────────────────────────────────────────────────────────

function PostCard({ post, index }: { post: ClubPost; index: number }) {
  const date = new Date(post.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const isPinned = post.type === "announcement";
  const initial = (post.authorName?.[0] ?? "?").toUpperCase();
  return (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(400)} style={styles.postWrap}>
      <GradientCard>
        {isPinned && (
          <View style={styles.pinnedBadge}>
            <Ionicons name="megaphone" size={13} color={colors.gold} />
            <Text style={styles.pinnedText}>Announcement</Text>
          </View>
        )}
        <View style={styles.postMeta}>
          <View style={styles.avatarRing}>
            <Gradient name="aqua" style={styles.avatarFill}>
              <Text style={styles.avatarText}>{initial}</Text>
            </Gradient>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.postAuthor}>{post.authorName}</Text>
            <Text style={styles.postDate}>{date}</Text>
          </View>
        </View>
        <Text style={styles.postContent}>{post.content}</Text>
        {post.commentCount > 0 && (
          <Text style={styles.postComments}>
            {post.commentCount} comment{post.commentCount !== 1 ? "s" : ""}
          </Text>
        )}
      </GradientCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md, padding: spacing.xl },
  emptyLogo: { marginBottom: spacing.sm },
  emptyTitle: { fontSize: type.size.xxl, fontWeight: type.weight.heavy, color: colors.white },
  emptySubtitle: { fontSize: type.size.md, color: "rgba(255,255,255,0.82)", textAlign: "center" },
  emptyActions: { alignSelf: "stretch", gap: spacing.md, marginTop: spacing.lg },
  joinBtn: { backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.5)" },
  eventsStrip: { paddingTop: spacing.md },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, marginBottom: spacing.sm, marginTop: spacing.sm },
  sectionLabel: { fontSize: type.size.xs, fontWeight: type.weight.heavy, color: colors.muted, letterSpacing: type.spacing.label },
  seeAll: { fontSize: type.size.sm, color: colors.ocean, fontWeight: type.weight.bold },
  eventCard: { width: 168, backgroundColor: colors.white, borderRadius: radii.lg, marginLeft: spacing.lg, padding: spacing.md, gap: spacing.xs, ...shadow.sm },
  eventTitle: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink, marginTop: spacing.xs },
  eventDateRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  eventDate: { fontSize: type.size.xs, color: colors.muted },
  composerWrap: { paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  composerInput: { fontSize: type.size.md, color: colors.ink, minHeight: 56 },
  postBtn: { alignSelf: "flex-end", marginTop: spacing.sm, minHeight: 40 },
  postWrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  pinnedBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: spacing.sm },
  pinnedText: { fontSize: type.size.xs, fontWeight: type.weight.heavy, color: colors.gold, letterSpacing: 0.5 },
  postMeta: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  avatarRing: { width: 40, height: 40, borderRadius: 20, overflow: "hidden", ...shadow.sm },
  avatarFill: { flex: 1, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.white, fontWeight: type.weight.heavy, fontSize: type.size.lg },
  postAuthor: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.ink },
  postDate: { fontSize: type.size.xs, color: colors.muted },
  postContent: { fontSize: type.size.md, color: colors.inkSoft, lineHeight: 22 },
  postComments: { fontSize: type.size.xs, color: colors.muted, marginTop: spacing.sm },
  emptyFeed: { textAlign: "center", color: colors.muted, marginTop: spacing.xl, paddingHorizontal: spacing.xl },
});
