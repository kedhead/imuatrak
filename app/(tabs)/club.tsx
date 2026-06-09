import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useClub } from "@/services/clubStore";
import { getPosts, createPost, deletePost, votePoll, getUpcomingEvents, toggleLike, getComments, addComment } from "@/services/clubService";
import { currentUser } from "@/services/auth";
import type { ClubPost, ClubEvent, ClubComment, PollOption } from "@/models/club";
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
            light
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
  const club = useClub((s) => s.club);
  const router = useRouter();
  const role = useClub((s) => s.role);
  const user = currentUser();
  const [posts, setPosts] = useState<ClubPost[]>([]);
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [postText, setPostText] = useState("");
  const [posting, setPosting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showPollComposer, setShowPollComposer] = useState(false);

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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Error", msg);
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

  const handleDelete = (postId: string) => {
    Alert.alert("Delete post", "Are you sure you want to delete this post?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await deletePost(clubId, postId);
            setPosts((prev) => prev.filter((p) => p.id !== postId));
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  const isAdmin = role === "owner" || role === "admin";

  return (
    <ScreenBackground>
      <GradientHeader
        title={clubName}
        subtitle="Your paddling crew"
        right={
          <>
            <Pressable onPress={() => router.push("/club/channels" as never)} hitSlop={8}>
              <Ionicons name="chatbubbles-outline" size={23} color={colors.white} />
            </Pressable>
            <Pressable onPress={() => router.push("/club/events" as never)} hitSlop={8}>
              <Ionicons name="calendar-outline" size={23} color={colors.white} />
            </Pressable>
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
            {/* Club identity card */}
            {(club?.logoUrl || club?.websiteUrl) && (
              <View style={styles.identityRow}>
                {club.logoUrl && (
                  <Image source={{ uri: club.logoUrl }} style={styles.clubLogo} />
                )}
                {club.websiteUrl && (
                  <Pressable
                    style={styles.websiteChip}
                    onPress={() => Linking.openURL(club.websiteUrl!)}
                  >
                    <Ionicons name="globe-outline" size={14} color={colors.ocean} />
                    <Text style={styles.websiteText} numberOfLines={1}>
                      {club.websiteUrl.replace(/^https?:\/\//, "")}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}

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
                <View style={styles.composerRow}>
                  <TextInput
                    style={styles.composerInput}
                    placeholder="Share something with the club…"
                    placeholderTextColor={colors.muted}
                    value={postText}
                    onChangeText={setPostText}
                    multiline
                    maxLength={2000}
                  />
                  {postText.trim().length > 0 ? (
                    <AnimatedPressable
                      onPress={() => void handlePost()}
                      disabled={posting}
                      haptic
                      style={[styles.postSendBtn, posting && { opacity: 0.5 }]}
                    >
                      {posting
                        ? <ActivityIndicator size="small" color={colors.white} />
                        : <Ionicons name="send" size={18} color={colors.white} />
                      }
                    </AnimatedPressable>
                  ) : (
                    <AnimatedPressable
                      onPress={() => setShowPollComposer(true)}
                      haptic
                      style={styles.pollIconBtn}
                    >
                      <Ionicons name="bar-chart-outline" size={20} color={colors.ocean} />
                    </AnimatedPressable>
                  )}
                </View>
              </GradientCard>
            </View>
            {showPollComposer && (
              <PollComposer
                clubId={clubId}
                onClose={() => setShowPollComposer(false)}
                onCreated={(poll) => {
                  setPosts((prev) => [poll, ...prev]);
                  setShowPollComposer(false);
                }}
              />
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>FEED</Text>
            </View>
          </>
        }
        renderItem={({ item, index }) => (
          <PostCard
            post={item}
            index={index}
            clubId={clubId}
            currentUserId={user?.uid}
            isAdmin={isAdmin}
            onDelete={handleDelete}
            onLikeChange={(id, delta, liked) =>
              setPosts((prev) =>
                prev.map((p) =>
                  p.id === id
                    ? { ...p, likeCount: p.likeCount + delta, likedBy: liked ? [...(p.likedBy ?? []), user!.uid] : (p.likedBy ?? []).filter((u) => u !== user!.uid) }
                    : p,
                ),
              )
            }
            onCommentAdded={(id) =>
              setPosts((prev) =>
                prev.map((p) => p.id === id ? { ...p, commentCount: p.commentCount + 1 } : p),
              )
            }
          />
        )}
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

function PostCard({
  post,
  index,
  clubId,
  currentUserId,
  isAdmin,
  onDelete,
  onLikeChange,
  onCommentAdded,
}: {
  post: ClubPost;
  index: number;
  clubId: string;
  currentUserId?: string;
  isAdmin?: boolean;
  onDelete: (id: string) => void;
  onLikeChange: (id: string, delta: number, liked: boolean) => void;
  onCommentAdded: (id: string) => void;
}) {
  const date = new Date(post.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const isPinned = post.type === "announcement";
  const initial = (post.authorName?.[0] ?? "?").toUpperCase();
  const liked = currentUserId ? (post.likedBy ?? []).includes(currentUserId) : false;
  const [liking, setLiking] = useState(false);
  const [showComments, setShowComments] = useState(false);

  const handleLike = async () => {
    if (!currentUserId || liking) return;
    setLiking(true);
    try {
      const result = await toggleLike(clubId, post.id, currentUserId);
      onLikeChange(post.id, result.liked ? 1 : -1, result.liked);
    } finally {
      setLiking(false);
    }
  };

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
          {(currentUserId === post.authorId || isAdmin) && (
            <Pressable onPress={() => onDelete(post.id)} hitSlop={12}>
              <Ionicons name="ellipsis-vertical" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>
        <Text style={styles.postContent}>{post.content}</Text>
        {post.type === "poll" && (
          <PollCard post={post} clubId={clubId} currentUserId={currentUserId} />
        )}
        {post.type !== "poll" && (
          <View style={styles.postActions}>
            <AnimatedPressable onPress={handleLike} disabled={!currentUserId || liking} style={styles.likeBtn} haptic>
              <Ionicons name={liked ? "heart" : "heart-outline"} size={18} color={liked ? colors.coral : colors.muted} />
              {post.likeCount > 0 && (
                <Text style={[styles.likeCount, liked && { color: colors.coral }]}>{post.likeCount}</Text>
              )}
            </AnimatedPressable>
            <AnimatedPressable onPress={() => setShowComments(true)} style={styles.likeBtn} haptic>
              <Ionicons name="chatbubble-outline" size={16} color={colors.muted} />
              {post.commentCount > 0 && (
                <Text style={styles.likeCount}>{post.commentCount}</Text>
              )}
            </AnimatedPressable>
          </View>
        )}
      </GradientCard>
      {showComments && (
        <CommentsSheet
          clubId={clubId}
          postId={post.id}
          currentUserId={currentUserId}
          onClose={() => setShowComments(false)}
          onCommentAdded={() => onCommentAdded(post.id)}
        />
      )}
    </Animated.View>
  );
}

// ── Comments sheet ────────────────────────────────────────────────────────────

function CommentsSheet({
  clubId,
  postId,
  currentUserId,
  onClose,
  onCommentAdded,
}: {
  clubId: string;
  postId: string;
  currentUserId?: string;
  onClose: () => void;
  onCommentAdded: () => void;
}) {
  const [comments, setComments] = useState<ClubComment[]>([]);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    void getComments(clubId, postId).then(setComments);
  }, [clubId, postId]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || !currentUserId || posting) return;
    setPosting(true);
    try {
      const me = currentUser();
      const comment = await addComment(clubId, postId, currentUserId, me?.displayName ?? "Member", content);
      setComments((prev) => [...prev, comment]);
      setText("");
      onCommentAdded();
    } finally {
      setPosting(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.sheet}
      >
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Comments</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>
        <ScrollView style={styles.commentList} contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}>
          {comments.length === 0 && (
            <Text style={{ color: colors.muted, textAlign: "center", marginTop: spacing.lg }}>
              No comments yet. Be the first!
            </Text>
          )}
          {comments.map((c) => (
            <View key={c.id} style={styles.commentItem}>
              <Text style={styles.commentAuthor}>{c.authorName}</Text>
              <Text style={styles.commentText}>{c.content}</Text>
            </View>
          ))}
        </ScrollView>
        {currentUserId && (
          <View style={styles.commentComposer}>
            <TextInput
              style={styles.commentInput}
              placeholder="Add a comment…"
              placeholderTextColor={colors.muted}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={500}
            />
            <AnimatedPressable
              onPress={handleSend}
              disabled={!text.trim() || posting}
              haptic
              style={[styles.sendBtn, (!text.trim() || posting) && { opacity: 0.4 }]}
            >
              <Ionicons name="send" size={18} color={colors.white} />
            </AnimatedPressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Poll composer modal ───────────────────────────────────────────────────────

function PollComposer({
  clubId,
  onClose,
  onCreated,
}: {
  clubId: string;
  onClose: () => void;
  onCreated: (post: ClubPost) => void;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multipleChoice, setMultipleChoice] = useState(false);
  const [expiryEnabled, setExpiryEnabled] = useState(false);
  const [expiryDate, setExpiryDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = question.trim().length > 0 && options.filter((o) => o.trim()).length >= 2;

  const setOption = (i: number, text: string) => {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? text : o)));
  };

  const addOption = () => {
    if (options.length < 4) setOptions((prev) => [...prev, ""]);
  };

  const removeOption = (i: number) => {
    if (options.length > 2) setOptions((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleCreate = async () => {
    if (!canSubmit) return;
    const user = currentUser();
    if (!user) return;
    setSubmitting(true);
    try {
      const pollOptions: PollOption[] = options.filter((o) => o.trim()).map((o) => ({ text: o.trim() }));
      const post = await createPost(clubId, user.uid, user.displayName ?? "Member", {
        type: "poll",
        content: question.trim(),
        pollOptions,
        pollMultipleChoice: multipleChoice,
        ...(expiryEnabled && { pollEndsAt: expiryDate.toISOString() }),
      });
      onCreated(post);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>New Poll</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <Text style={styles.pollLabel}>Question</Text>
          <TextInput
            style={styles.pollQuestionInput}
            placeholder="Ask the club something…"
            placeholderTextColor={colors.muted}
            value={question}
            onChangeText={setQuestion}
            multiline
            maxLength={200}
            autoFocus
          />

          <Text style={[styles.pollLabel, { marginTop: spacing.sm }]}>Options</Text>
          {options.map((opt, i) => (
            <View key={i} style={styles.pollOptionRow}>
              <TextInput
                style={styles.pollOptionInput}
                placeholder={`Option ${i + 1}`}
                placeholderTextColor={colors.muted}
                value={opt}
                onChangeText={(t) => setOption(i, t)}
                maxLength={80}
              />
              {options.length > 2 && (
                <Pressable onPress={() => removeOption(i)} hitSlop={10} style={styles.pollOptionRemove}>
                  <Ionicons name="close-circle" size={20} color={colors.muted} />
                </Pressable>
              )}
            </View>
          ))}
          {options.length < 4 && (
            <Pressable onPress={addOption} style={styles.addOptionBtn}>
              <Ionicons name="add-circle-outline" size={18} color={colors.ocean} />
              <Text style={styles.addOptionText}>Add option</Text>
            </Pressable>
          )}

          <View style={styles.pollToggleRow}>
            <Text style={styles.pollToggleLabel}>Multiple choice</Text>
            <Switch
              value={multipleChoice}
              onValueChange={setMultipleChoice}
              trackColor={{ true: colors.ocean }}
              thumbColor={colors.white}
            />
          </View>

          <View style={styles.pollToggleRow}>
            <Text style={styles.pollToggleLabel}>Poll expires</Text>
            <Switch
              value={expiryEnabled}
              onValueChange={setExpiryEnabled}
              trackColor={{ true: colors.ocean }}
              thumbColor={colors.white}
            />
          </View>
          {expiryEnabled && (
            <>
              <Pressable onPress={() => setShowDatePicker(true)} style={styles.datePillBtn}>
                <Ionicons name="calendar-outline" size={15} color={colors.ocean} />
                <Text style={styles.datePillText}>
                  {expiryDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </Text>
              </Pressable>
              {showDatePicker && (
                <DateTimePicker
                  value={expiryDate}
                  mode="date"
                  minimumDate={new Date()}
                  onChange={(_, d) => {
                    setShowDatePicker(false);
                    if (d) setExpiryDate(d);
                  }}
                />
              )}
            </>
          )}

          <AnimatedPressable
            onPress={() => void handleCreate()}
            disabled={!canSubmit || submitting}
            haptic
            style={[styles.postSendBtn, { width: "100%", borderRadius: 12, height: 48, marginTop: spacing.sm }, (!canSubmit || submitting) && { opacity: 0.4 }]}
          >
            {submitting
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Text style={{ color: colors.white, fontWeight: "700", fontSize: 16 }}>Create Poll</Text>
            }
          </AnimatedPressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Poll card (rendered inside PostCard for type === "poll") ──────────────────

function PollCard({
  post,
  clubId,
  currentUserId,
}: {
  post: ClubPost;
  clubId: string;
  currentUserId?: string;
}) {
  const [localVotes, setLocalVotes] = useState<Record<string, string[]>>(post.pollVotes ?? {});
  const [voting, setVoting] = useState(false);

  const options = post.pollOptions ?? [];
  const multi = post.pollMultipleChoice ?? false;
  const isExpired = post.pollEndsAt ? new Date(post.pollEndsAt) < new Date() : false;
  const canVote = !!currentUserId && !isExpired && !voting;
  const totalVotes = Object.values(localVotes).reduce((sum, arr) => sum + arr.length, 0);

  const handleVote = async (i: number) => {
    if (!canVote || !currentUserId) return;
    const key = String(i);

    // Optimistic update
    const next = Object.fromEntries(Object.entries(localVotes).map(([k, v]) => [k, [...v]]));
    if (multi) {
      const arr = next[key] ?? [];
      const idx = arr.indexOf(currentUserId);
      if (idx >= 0) arr.splice(idx, 1); else arr.push(currentUserId);
      next[key] = arr;
    } else {
      options.forEach((_, j) => {
        const k = String(j);
        next[k] = (next[k] ?? []).filter((u) => u !== currentUserId);
      });
      const arr = next[key] ?? [];
      const idx = arr.indexOf(currentUserId);
      if (idx >= 0) arr.splice(idx, 1); else arr.push(currentUserId);
      next[key] = arr;
    }
    setLocalVotes(next);
    setVoting(true);
    try {
      await votePoll(clubId, post.id, currentUserId, i, localVotes, multi);
    } catch {
      setLocalVotes(post.pollVotes ?? {});
    } finally {
      setVoting(false);
    }
  };

  return (
    <View style={styles.pollWrap}>
      {options.map((opt, i) => {
        const count = (localVotes[String(i)] ?? []).length;
        const pct = totalVotes > 0 ? count / totalVotes : 0;
        const voted = currentUserId ? (localVotes[String(i)] ?? []).includes(currentUserId) : false;
        return (
          <Pressable
            key={i}
            onPress={() => void handleVote(i)}
            disabled={!canVote}
            style={[styles.pollOption, voted && styles.pollOptionVoted]}
          >
            <View style={[styles.pollBar, { width: `${Math.round(pct * 100)}%` as `${number}%` }]} />
            <View style={styles.pollOptionContent}>
              <View style={styles.pollCheckCircle}>
                {voted && <Ionicons name="checkmark" size={12} color={colors.white} />}
              </View>
              <Text style={[styles.pollOptionText, voted && { color: colors.ocean, fontWeight: "700" }]} numberOfLines={2}>
                {opt.text}
              </Text>
              <Text style={styles.pollPct}>{totalVotes > 0 ? `${Math.round(pct * 100)}%` : ""}</Text>
            </View>
          </Pressable>
        );
      })}
      <Text style={styles.pollMeta}>
        {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
        {multi ? " · Multiple choice" : ""}
        {isExpired ? " · Closed" : post.pollEndsAt ? ` · Ends ${new Date(post.pollEndsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md, padding: spacing.xl },
  emptyLogo: { marginBottom: spacing.sm },
  emptyTitle: { fontSize: type.size.xxl, fontWeight: type.weight.heavy, color: colors.white },
  emptySubtitle: { fontSize: type.size.md, color: "rgba(255,255,255,0.82)", textAlign: "center" },
  emptyActions: { alignSelf: "stretch", gap: spacing.md, marginTop: spacing.lg },
  joinBtn: { backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.5)" },
  identityRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  clubLogo: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.card },
  websiteChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.card, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, flex: 1 },
  websiteText: { fontSize: 13, color: colors.ocean, fontWeight: "600", flex: 1 },
  eventsStrip: { paddingTop: spacing.md },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, marginBottom: spacing.sm, marginTop: spacing.sm },
  sectionLabel: { fontSize: type.size.xs, fontWeight: type.weight.heavy, color: colors.muted, letterSpacing: type.spacing.label },
  seeAll: { fontSize: type.size.sm, color: colors.ocean, fontWeight: type.weight.bold },
  eventCard: { width: 168, backgroundColor: colors.white, borderRadius: radii.lg, marginLeft: spacing.lg, padding: spacing.md, gap: spacing.xs, ...shadow.sm },
  eventTitle: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink, marginTop: spacing.xs },
  eventDateRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  eventDate: { fontSize: type.size.xs, color: colors.muted },
  composerWrap: { paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  composerInput: { flex: 1, fontSize: type.size.md, color: colors.ink, minHeight: 56 },
  postSendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.ocean, alignItems: "center", justifyContent: "center", marginBottom: 2 },
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
  postActions: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  likeBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingRight: spacing.sm },
  likeCount: { fontSize: type.size.sm, color: colors.muted, fontWeight: type.weight.bold },
  postComments: { fontSize: type.size.xs, color: colors.muted },
  emptyFeed: { textAlign: "center", color: colors.muted, marginTop: spacing.xl, paddingHorizontal: spacing.xl },
  // Comments modal
  modalOverlay: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: colors.white, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, maxHeight: "80%", paddingBottom: spacing.xl },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.card, alignSelf: "center", marginTop: spacing.sm },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  sheetTitle: { fontSize: type.size.lg, fontWeight: type.weight.bold, color: colors.ink },
  commentList: { flexGrow: 0 },
  commentItem: { backgroundColor: colors.bgSoft, borderRadius: radii.md, padding: spacing.sm },
  commentAuthor: { fontSize: type.size.xs, fontWeight: type.weight.bold, color: colors.ink, marginBottom: 2 },
  commentText: { fontSize: type.size.sm, color: colors.inkSoft, lineHeight: 20 },
  commentComposer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.card },
  commentInput: { flex: 1, fontSize: type.size.sm, color: colors.ink, backgroundColor: colors.bgSoft, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, maxHeight: 100 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.ocean, alignItems: "center", justifyContent: "center" },
  // Poll composer
  pollIconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.bgSoft, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  pollLabel: { fontSize: type.size.xs, fontWeight: type.weight.heavy, color: colors.muted, letterSpacing: type.spacing.label },
  pollQuestionInput: { fontSize: type.size.md, color: colors.ink, backgroundColor: colors.bgSoft, borderRadius: radii.md, padding: spacing.md, minHeight: 64 },
  pollOptionRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pollOptionInput: { flex: 1, fontSize: type.size.sm, color: colors.ink, backgroundColor: colors.bgSoft, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  pollOptionRemove: { padding: 4 },
  addOptionBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  addOptionText: { fontSize: type.size.sm, color: colors.ocean, fontWeight: type.weight.bold },
  pollToggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  pollToggleLabel: { fontSize: type.size.md, color: colors.ink },
  datePillBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: colors.bgSoft, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  datePillText: { fontSize: type.size.sm, color: colors.ocean, fontWeight: type.weight.bold },
  // Poll card
  pollWrap: { marginTop: spacing.sm, gap: spacing.xs },
  pollOption: { borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.card, overflow: "hidden", minHeight: 44 },
  pollOptionVoted: { borderColor: colors.ocean },
  pollBar: { position: "absolute", top: 0, left: 0, bottom: 0, backgroundColor: "rgba(0,115,230,0.08)" },
  pollOptionContent: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 10 },
  pollCheckCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.card, alignItems: "center", justifyContent: "center" },
  pollOptionText: { flex: 1, fontSize: type.size.sm, color: colors.ink },
  pollPct: { fontSize: type.size.xs, color: colors.muted, fontWeight: type.weight.bold, minWidth: 32, textAlign: "right" },
  pollMeta: { fontSize: type.size.xs, color: colors.muted, marginTop: 2 },
});
