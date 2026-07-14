import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { currentUser } from "@/services/auth";
import {
  subscribeChannels,
  getChannelPreferences,
  markChannelRead,
} from "@/services/clubService";
import { setAppBadge } from "@/services/badge";
import { useClub } from "@/services/clubStore";
import type { ClubChannel, ChannelPreference } from "@/models/club";
import { GradientHeader } from "@/ui/GradientHeader";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, radii, shadow, spacing, type } from "@/ui/theme";

export default function ChannelsScreen() {
  const club = useClub((s) => s.club);
  const role = useClub((s) => s.role);
  const user = currentUser();
  const router = useRouter();

  const [channels, setChannels] = useState<ClubChannel[]>([]);
  const [prefs, setPrefs] = useState<Map<string, ChannelPreference>>(new Map());
  const [loading, setLoading] = useState(true);

  const isAdmin = role === "owner" || role === "admin";
  const canAddChannels =
    club?.subscriptionStatus === "trial" || club?.subscriptionStatus === "active";

  useEffect(() => {
    if (!club || !user) return;
    const unsub = subscribeChannels(club.id, (updated) => {
      const uid = user.uid;
      const visible = updated.filter(
        (ch) =>
          !ch.isPrivate ||
          ch.memberIds.includes(uid) ||
          role === "owner" ||
          role === "admin",
      );
      setChannels(visible);
      setLoading(false);
    });
    return unsub;
  }, [club?.id, user?.uid, role]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      void getChannelPreferences(user.uid).then(setPrefs);
    }, [user?.uid]),
  );

  const handleChannelPress = async (channelId: string) => {
    if (user) await markChannelRead(user.uid, channelId).then(setAppBadge).catch(() => undefined);
    router.push(`/club/chat/${channelId}` as never);
  };

  if (!club) {
    return (
      <ScreenBackground>
        <View style={styles.center}>
          <Text style={styles.emptyText}>No club selected.</Text>
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <GradientHeader
        title="Channels"
        onBack={() => router.back()}
        right={
          isAdmin ? (
            <Pressable
              onPress={() => router.push("/club/admin/channels" as never)}
              hitSlop={8}
            >
              <Ionicons name="add" size={26} color={colors.white} />
            </Pressable>
          ) : undefined
        }
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.ocean} />
        </View>
      ) : channels.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No channels yet.</Text>
          {isAdmin && (
            <Text style={[styles.emptyText, { marginTop: spacing.sm }]}>
              Tap + to create one.
            </Text>
          )}
        </View>
      ) : (
        <FlatList
          data={channels}
          keyExtractor={(ch) => ch.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ChannelRow
              channel={item}
              pref={prefs.get(item.id)}
              onPress={() => void handleChannelPress(item.id)}
            />
          )}
          ListFooterComponent={
            !canAddChannels && isAdmin ? (
              <Pressable
                style={styles.upgradeBanner}
                onPress={() => router.push("/paywall" as never)}
              >
                <Ionicons name="lock-closed-outline" size={16} color={colors.ocean} />
                <Text style={styles.upgradeText}>
                  Upgrade to add more channels
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.muted} />
              </Pressable>
            ) : null
          }
        />
      )}
    </ScreenBackground>
  );
}

function ChannelRow({
  channel,
  pref,
  onPress,
}: {
  channel: ClubChannel;
  pref?: ChannelPreference;
  onPress: () => void;
}) {
  const hasUnread =
    channel.lastMessageAt &&
    (!pref?.lastReadAt || channel.lastMessageAt > pref.lastReadAt);

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <ChannelIcon channel={channel} size={40} />
      <View style={styles.rowInfo}>
        <View style={styles.rowTitleRow}>
          <Text style={styles.channelName} numberOfLines={1}>
            {channel.name}
          </Text>
          {channel.isPrivate && (
            <Ionicons
              name="lock-closed"
              size={12}
              color={colors.muted}
              style={{ marginLeft: 4 }}
            />
          )}
          {channel.description ? (
            <Text style={styles.channelDesc} numberOfLines={1}>
              {channel.description}
            </Text>
          ) : null}
        </View>
      </View>
      {hasUnread && <View style={styles.unreadDot} />}
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

export function ChannelIcon({
  channel,
  size = 32,
}: {
  channel: Pick<ClubChannel, "icon" | "iconType" | "name">;
  size?: number;
}) {
  const radius = size / 2;
  if (channel.iconType === "emoji") {
    return (
      <View style={[styles.iconWrap, { width: size, height: size, borderRadius: radius }]}>
        <Text style={{ fontSize: size * 0.5 }}>{channel.icon}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.iconWrap, { width: size, height: size, borderRadius: radius }]}>
      <Ionicons
        name={channel.icon as never}
        size={size * 0.55}
        color={colors.ocean}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.sm },
  emptyText: { color: colors.muted, fontSize: type.size.md },
  list: { paddingVertical: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    gap: spacing.md,
  },
  rowInfo: { flex: 1 },
  rowTitleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 2 },
  channelName: {
    fontSize: type.size.md,
    fontWeight: type.weight.bold,
    color: colors.ink,
  },
  channelDesc: {
    fontSize: type.size.xs,
    color: colors.muted,
    marginTop: 2,
  },
  iconWrap: {
    backgroundColor: colors.bgSoft,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.ocean,
    marginRight: 4,
  },
  upgradeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    margin: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.bgSoft,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  upgradeText: {
    flex: 1,
    fontSize: type.size.sm,
    color: colors.ocean,
    fontWeight: type.weight.bold,
  },
});
