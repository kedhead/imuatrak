import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { dmThreadTitle, type DmThread } from "@/models/club";
import { currentUser } from "@/services/auth";
import { leaveGroupChat, renameGroupChat, subscribeDmThread } from "@/services/dmService";
import { Avatar } from "@/ui/Avatar";
import { Button } from "@/ui/Button";
import { GradientCard } from "@/ui/GradientCard";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, radii, spacing, type } from "@/ui/theme";

/** Members, rename, add people, leave. Any member can do all of it — groups
 *  are the members' own, with no admin in charge. */
export default function GroupInfoScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const router = useRouter();
  const me = currentUser();
  const [thread, setThread] = useState<(DmThread & { id: string }) | null | undefined>(undefined);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!threadId) return;
    return subscribeDmThread(threadId, setThread);
  }, [threadId]);

  if (thread === undefined) {
    return (
      <ScreenBackground>
        <View style={styles.center}>
          <ActivityIndicator color={colors.ocean} />
        </View>
      </ScreenBackground>
    );
  }
  if (!thread || !thread.isGroup) {
    return (
      <ScreenBackground>
        <View style={styles.center}>
          <Text style={styles.muted}>You're not in this group.</Text>
        </View>
      </ScreenBackground>
    );
  }

  const fail = (e: unknown) =>
    Alert.alert("Couldn't do that", e instanceof Error ? e.message : "Please try again.");

  const members = [...thread.participants].sort((a, b) =>
    a === me?.uid ? -1 : b === me?.uid ? 1 : (thread.participantNames[a] ?? "").localeCompare(thread.participantNames[b] ?? ""),
  );

  const saveName = async () => {
    setBusy(true);
    try {
      await renameGroupChat(thread.id, draft);
      setRenaming(false);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const leave = () =>
    Alert.alert(`Leave ${dmThreadTitle(thread, me?.uid)}?`, "You won't get its messages any more. Someone in the group can add you back.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await leaveGroupChat(thread.id);
            router.dismissTo("/club/channels" as never);
          } catch (e) {
            setBusy(false);
            fail(e);
          }
        },
      },
    ]);

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <View style={styles.groupAvatar}>
            <Ionicons name="people" size={30} color={colors.white} />
          </View>
          <Pressable
            style={styles.titleRow}
            onPress={() => {
              setDraft(thread.name ?? "");
              setRenaming(true);
            }}
          >
            <Text style={styles.title}>{dmThreadTitle(thread, me?.uid)}</Text>
            <Ionicons name="pencil" size={15} color={colors.muted} />
          </Pressable>
          <Text style={styles.muted}>{thread.participants.length} people</Text>
        </View>

        <View style={styles.privacy}>
          <Ionicons name="lock-closed" size={14} color={colors.success} />
          <Text style={styles.privacyText}>
            Only the people below can see this chat. Club admins can't, unless they're in it.
          </Text>
        </View>

        <GradientCard padded={false}>
          <Pressable
            style={styles.row}
            onPress={() =>
              router.push(
                `/dm/new?addTo=${thread.id}&existing=${thread.participants.join(",")}` as never,
              )
            }
          >
            <View style={styles.addIcon}>
              <Ionicons name="person-add" size={16} color={colors.ocean} />
            </View>
            <Text style={[styles.rowName, { color: colors.ocean, fontWeight: type.weight.bold }]}>Add people</Text>
          </Pressable>
          {members.map((uid) => {
            const name = thread.participantNames[uid] ?? "Member";
            return (
              <View key={uid} style={styles.row}>
                <Avatar uri={thread.participantAvatars?.[uid]} name={name} uid={uid} size={34} />
                <Text style={styles.rowName} numberOfLines={1}>
                  {uid === me?.uid ? `${name} (you)` : name}
                </Text>
                {uid === thread.createdBy && <Text style={styles.tag}>started it</Text>}
              </View>
            );
          })}
        </GradientCard>

        <Button title="Leave group" variant="danger" disabled={busy} onPress={leave} style={styles.leave} />
      </ScrollView>

      <Modal visible={renaming} transparent animationType="fade" onRequestClose={() => setRenaming(false)}>
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <Pressable style={styles.overlay} onPress={() => setRenaming(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>Rename group</Text>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                autoFocus
                maxLength={50}
                returnKeyType="done"
                onSubmitEditing={() => void saveName()}
              />
              <Button
                title={busy ? "Saving…" : "Save"}
                gradient="aqua"
                disabled={busy || !draft.trim()}
                onPress={() => void saveName()}
                style={{ marginTop: spacing.md }}
              />
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontSize: type.size.sm },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 120 },
  hero: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.md },
  groupAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.oceanLight,
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.sm },
  title: { fontSize: type.size.xl, fontWeight: type.weight.heavy, color: colors.ink },
  privacy: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.success + "18",
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  privacyText: { flex: 1, fontSize: type.size.xs, color: colors.inkSoft, lineHeight: 17 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  addIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.ocean + "14",
    alignItems: "center",
    justifyContent: "center",
  },
  rowName: { flex: 1, fontSize: type.size.md, color: colors.ink },
  tag: { fontSize: type.size.xs, color: colors.muted, fontStyle: "italic" },
  leave: { marginTop: spacing.md, minHeight: 44 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: spacing.lg },
  sheet: { backgroundColor: colors.white, borderRadius: radii.xl, padding: spacing.lg },
  sheetTitle: { fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.ink, marginBottom: spacing.md },
  input: { backgroundColor: colors.bg, borderRadius: radii.md, padding: spacing.md, fontSize: type.size.md, color: colors.ink },
});
