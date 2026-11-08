import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import type { ClubMember } from "@/models/club";
import { currentUser } from "@/services/auth";
import { useClub } from "@/services/clubStore";
import { addGroupMembers, createGroupChat, openDmThread } from "@/services/dmService";
import { Avatar } from "@/ui/Avatar";
import { Button } from "@/ui/Button";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, radii, spacing, type } from "@/ui/theme";

// Mirrors GROUP_NAME_MAX / GROUP_MAX_MEMBERS in firebase/functions/src/groupChat.ts.
const GROUP_NAME_MAX = 50;
const GROUP_MAX_MEMBERS = 50;

/**
 * Start a conversation from the club roster: tap one person for a direct
 * message, or switch to Group, pick several and name it. Also used (with
 * ?addTo=threadId&existing=uid,uid) to add people to an existing group.
 */
export default function NewConversationScreen() {
  const router = useRouter();
  const { addTo, existing } = useLocalSearchParams<{ addTo?: string; existing?: string }>();
  const adding = !!addTo;
  const club = useClub((s) => s.club);
  const members = useClub((s) => s.members);
  const me = currentUser();

  const [mode, setMode] = useState<"dm" | "group">(adding ? "group" : "dm");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const alreadyIn = useMemo(() => new Set((existing ?? "").split(",").filter(Boolean)), [existing]);
  const people = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members
      .filter((m) => m.uid !== me?.uid && !alreadyIn.has(m.uid))
      .filter((m) => !q || m.displayName.toLowerCase().includes(q))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [members, me?.uid, alreadyIn, search]);

  const fail = (e: unknown) =>
    Alert.alert("Couldn't do that", e instanceof Error ? e.message : "Please try again.");

  const openDm = async (m: ClubMember) => {
    setBusy(true);
    try {
      const threadId = await openDmThread(m.uid);
      router.replace(`/dm/${threadId}` as never);
    } catch (e) {
      setBusy(false);
      fail(e);
    }
  };

  const toggle = (uid: string) =>
    setPicked((p) => (p.includes(uid) ? p.filter((x) => x !== uid) : [...p, uid]));

  const limit = GROUP_MAX_MEMBERS - (adding ? alreadyIn.size : 1);
  const canCreate = adding ? picked.length >= 1 : picked.length >= 2 && name.trim().length > 0;

  const submit = async () => {
    if (!club) return;
    setBusy(true);
    try {
      if (adding) {
        await addGroupMembers(addTo!, picked);
        router.back();
      } else {
        const threadId = await createGroupChat(club.id, name, picked);
        router.replace(`/dm/${threadId}` as never);
      }
    } catch (e) {
      setBusy(false);
      fail(e);
    }
  };

  const nameOf = (uid: string) => members.find((m) => m.uid === uid)?.displayName.split(" ")[0] ?? "Member";

  return (
    <ScreenBackground>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        {!adding && (
          <View style={styles.tabs}>
            {(["dm", "group"] as const).map((m) => (
              <Pressable key={m} style={[styles.tab, mode === m && styles.tabOn]} onPress={() => setMode(m)}>
                <Ionicons
                  name={m === "dm" ? "person-outline" : "people-outline"}
                  size={16}
                  color={mode === m ? colors.white : colors.inkSoft}
                />
                <Text style={[styles.tabText, mode === m && styles.tabTextOn]}>
                  {m === "dm" ? "Message" : "Group"}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {mode === "group" && !adding && (
          <TextInput
            style={styles.nameInput}
            placeholder="Group name, e.g. Sat carpool"
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
            maxLength={GROUP_NAME_MAX}
          />
        )}

        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            style={styles.search}
            placeholder={`Search ${club?.name ?? "your club"}`}
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
        </View>

        {mode === "group" && picked.length > 0 && (
          <Text style={styles.pickedLine} numberOfLines={2}>
            {adding ? "Adding " : "With you and "}
            {picked.map(nameOf).join(", ")}
          </Text>
        )}
        {mode === "group" && (
          <Text style={styles.hint}>
            Only the people in a group can see it — club admins included, unless they're added.
          </Text>
        )}

        <FlatList
          data={people}
          keyExtractor={(m) => m.uid}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>{search ? "No one matches that." : "No one else to add yet."}</Text>
          }
          renderItem={({ item }) => {
            const on = picked.includes(item.uid);
            const full = !on && picked.length >= limit;
            return (
              <Pressable
                style={[styles.row, full && { opacity: 0.4 }]}
                disabled={busy || full}
                onPress={() => (mode === "dm" ? void openDm(item) : toggle(item.uid))}
              >
                <Avatar uri={item.avatarUrl} name={item.displayName} uid={item.uid} size={36} />
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.displayName}
                </Text>
                {mode === "group" ? (
                  <Ionicons
                    name={on ? "checkmark-circle" : "ellipse-outline"}
                    size={22}
                    color={on ? colors.ocean : colors.line}
                  />
                ) : (
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                )}
              </Pressable>
            );
          }}
        />

        {mode === "group" && (
          <View style={styles.footer}>
            {busy ? (
              <ActivityIndicator color={colors.ocean} />
            ) : (
              <Button
                title={
                  adding
                    ? picked.length === 0
                      ? "Pick people to add"
                      : `Add ${picked.length} ${picked.length === 1 ? "person" : "people"}`
                    : picked.length < 2
                      ? "Pick at least 2 people"
                      : !name.trim()
                        ? "Name the group"
                        : `Create group (${picked.length + 1})`
                }
                gradient="aqua"
                disabled={!canCreate}
                onPress={() => void submit()}
              />
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabs: {
    flexDirection: "row",
    gap: spacing.xs,
    margin: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  tabOn: { backgroundColor: colors.ocean },
  tabText: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.inkSoft },
  tabTextOn: { color: colors.white },
  nameInput: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: type.size.lg,
    fontWeight: type.weight.bold,
    color: colors.ink,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
  },
  search: { flex: 1, paddingVertical: spacing.sm + 2, fontSize: type.size.md, color: colors.ink },
  pickedLine: { marginHorizontal: spacing.lg, marginTop: spacing.sm, fontSize: type.size.sm, color: colors.ocean, fontWeight: type.weight.bold },
  hint: { marginHorizontal: spacing.lg, marginTop: spacing.xs, fontSize: type.size.xs, color: colors.muted },
  list: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.xs, paddingBottom: 120 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.sm + 2,
  },
  rowName: { flex: 1, fontSize: type.size.md, color: colors.ink },
  empty: { textAlign: "center", color: colors.muted, marginTop: spacing.xl },
  footer: { padding: spacing.lg, paddingBottom: spacing.xl, backgroundColor: colors.bg },
});
