import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ClubMember, PollOption } from "@/models/club";
import { Avatar } from "./Avatar";
import { colors, radii, spacing, type } from "./theme";

/**
 * Staff: who picked what in a feed poll, and who hasn't voted yet. Votes are
 * already stored by uid on the post (pollVotes), so this is just names.
 * Voters who've since left the club are counted but can't be named.
 */
export function PollVotersSheet({
  visible,
  question,
  options,
  votes,
  members,
  onClose,
}: {
  visible: boolean;
  question: string;
  options: PollOption[];
  votes: Record<string, string[]>;
  members: ClubMember[];
  onClose: () => void;
}) {
  const byUid = new Map(members.map((m) => [m.uid, m]));
  const voted = new Set(Object.values(votes).flat());
  const notVoted = members
    .filter((m) => !voted.has(m.uid))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const row = (m: ClubMember) => (
    <View key={m.uid} style={styles.person}>
      <Avatar uri={m.avatarUrl} name={m.displayName} uid={m.uid} size={28} />
      <Text style={styles.personName} numberOfLines={1}>{m.displayName}</Text>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.head}>
            <Text style={styles.title} numberOfLines={2}>{question || "Poll votes"}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            {options.map((opt, i) => {
              const uids = votes[String(i)] ?? [];
              const known = uids
                .map((u) => byUid.get(u))
                .filter((m): m is ClubMember => !!m)
                .sort((a, b) => a.displayName.localeCompare(b.displayName));
              const gone = uids.length - known.length;
              return (
                <View key={i} style={styles.section}>
                  <Text style={styles.option}>
                    {opt.text} <Text style={styles.count}>· {uids.length}</Text>
                  </Text>
                  {known.length === 0 && gone === 0 ? (
                    <Text style={styles.none}>No votes yet</Text>
                  ) : (
                    known.map(row)
                  )}
                  {gone > 0 && (
                    <Text style={styles.none}>+{gone} who left the club</Text>
                  )}
                </View>
              );
            })}
            <View style={styles.section}>
              <Text style={[styles.option, { color: colors.muted }]}>
                Haven&apos;t voted <Text style={styles.count}>· {notVoted.length}</Text>
              </Text>
              {notVoted.length === 0 ? <Text style={styles.none}>Everyone has voted 🎉</Text> : notVoted.map(row)}
            </View>
            <Text style={styles.footnote}>Only coaches and admins can see this.</Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: {
    maxHeight: "85%",
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.lg,
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  title: { flex: 1, fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.ink },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  section: { marginTop: spacing.md },
  option: { fontSize: type.size.md, fontWeight: type.weight.heavy, color: colors.ink, marginBottom: spacing.xs },
  count: { color: colors.muted, fontWeight: type.weight.bold },
  person: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 5 },
  personName: { flex: 1, fontSize: type.size.md, color: colors.inkSoft },
  none: { fontSize: type.size.sm, color: colors.muted, paddingVertical: 4 },
  footnote: { fontSize: type.size.xs, color: colors.muted, marginTop: spacing.lg, textAlign: "center" },
});
