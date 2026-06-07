import { Ionicons } from "@expo/vector-icons";
import { httpsCallable } from "firebase/functions";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { functions } from "@/services/firebase";
import {
  subscribeChannels,
  deleteChannel,
  addChannelMember,
  removeChannelMember,
  setChannelPreference,
} from "@/services/clubService";
import { useClub } from "@/services/clubStore";
import { currentUser } from "@/services/auth";
import type { ClubChannel, ClubMember } from "@/models/club";
import { ChannelIcon } from "../channels";
import { colors, radii, spacing, type } from "@/ui/theme";

const PRESET_ICONS: Array<{ icon: string; iconType: "emoji" | "ionicon" }> = [
  { icon: "chatbubbles-outline", iconType: "ionicon" },
  { icon: "people-outline", iconType: "ionicon" },
  { icon: "construct-outline", iconType: "ionicon" },
  { icon: "ribbon-outline", iconType: "ionicon" },
  { icon: "megaphone-outline", iconType: "ionicon" },
  { icon: "🏄", iconType: "emoji" },
  { icon: "🚣", iconType: "emoji" },
  { icon: "⚓", iconType: "emoji" },
  { icon: "🔧", iconType: "emoji" },
  { icon: "🏆", iconType: "emoji" },
];

export default function ManageChannelsScreen() {
  const club = useClub((s) => s.club);
  const role = useClub((s) => s.role);
  const members = useClub((s) => s.members);
  const user = currentUser();

  const [channels, setChannels] = useState<ClubChannel[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editChannel, setEditChannel] = useState<ClubChannel | null>(null);

  useEffect(() => {
    if (!club) return;
    return subscribeChannels(club.id, setChannels);
  }, [club?.id]);

  if (!club || (role !== "owner" && role !== "admin")) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.muted }}>Admin access required</Text>
      </View>
    );
  }

  const canAddChannels =
    club.subscriptionStatus === "trial" || club.subscriptionStatus === "active";

  const handleDelete = (ch: ClubChannel) => {
    if (ch.id === "general") {
      Alert.alert("Cannot delete", "The General channel cannot be deleted.");
      return;
    }
    Alert.alert("Delete channel", `Delete "#${ch.name}"? Messages will be lost.`, [
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteChannel(club.id, ch.id);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <FlatList
        data={channels}
        keyExtractor={(ch) => ch.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ChannelAdminRow
            channel={item}
            onEdit={() => setEditChannel(item)}
            onDelete={() => handleDelete(item)}
          />
        )}
        ListFooterComponent={
          canAddChannels ? (
            <Pressable style={styles.addBtn} onPress={() => setShowCreate(true)}>
              <Ionicons name="add-circle-outline" size={20} color={colors.ocean} />
              <Text style={styles.addBtnText}>New Channel</Text>
            </Pressable>
          ) : (
            <View style={styles.lockedNote}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.muted} />
              <Text style={styles.lockedText}>
                Upgrade to create additional channels
              </Text>
            </View>
          )
        }
      />

      {showCreate && (
        <ChannelForm
          clubId={club.id}
          clubMembers={members}
          onClose={() => setShowCreate(false)}
        />
      )}

      {editChannel && (
        <ChannelForm
          clubId={club.id}
          clubMembers={members}
          existing={editChannel}
          onClose={() => setEditChannel(null)}
        />
      )}
    </SafeAreaView>
  );
}

function ChannelAdminRow({
  channel,
  onEdit,
  onDelete,
}: {
  channel: ClubChannel;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.row}>
      <ChannelIcon channel={channel} size={38} />
      <View style={styles.rowInfo}>
        <Text style={styles.channelName}>{channel.name}</Text>
        {channel.isPrivate && (
          <Text style={styles.privateBadge}>Private · {channel.memberIds.length} members</Text>
        )}
      </View>
      <Pressable onPress={onEdit} hitSlop={8} style={styles.actionIcon}>
        <Ionicons name="pencil-outline" size={18} color={colors.ocean} />
      </Pressable>
      <Pressable onPress={onDelete} hitSlop={8} style={styles.actionIcon}>
        <Ionicons name="trash-outline" size={18} color={colors.danger} />
      </Pressable>
    </View>
  );
}

function ChannelForm({
  clubId,
  clubMembers,
  existing,
  onClose,
}: {
  clubId: string;
  clubMembers: ClubMember[];
  existing?: ClubChannel;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [isPrivate, setIsPrivate] = useState(existing?.isPrivate ?? false);
  const [selectedIcon, setSelectedIcon] = useState<{ icon: string; iconType: "emoji" | "ionicon" }>(
    existing
      ? { icon: existing.icon, iconType: existing.iconType }
      : PRESET_ICONS[0]!,
  );
  const [memberIds, setMemberIds] = useState<string[]>(existing?.memberIds ?? []);
  const [saving, setSaving] = useState(false);

  const toggleMember = (uid: string) => {
    setMemberIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid],
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Please enter a channel name.");
      return;
    }
    setSaving(true);
    try {
      if (existing) {
        // Update existing: direct Firestore write is allowed for update (admin only)
        const { updateChannel } = await import("@/services/clubService");
        await updateChannel(clubId, existing.id, {
          name: name.trim(),
          icon: selectedIcon.icon,
          iconType: selectedIcon.iconType,
          description: description.trim(),
        });
        // Sync private member list
        const toAdd = memberIds.filter((uid) => !existing.memberIds.includes(uid));
        const toRemove = existing.memberIds.filter((uid) => !memberIds.includes(uid));
        await Promise.all([
          ...toAdd.map((uid) => addChannelMember(clubId, existing.id, uid)),
          ...toRemove.map((uid) => removeChannelMember(clubId, existing.id, uid)),
        ]);
      } else {
        const createChannel = httpsCallable<
          {
            clubId: string;
            name: string;
            icon: string;
            iconType: string;
            description: string;
            isPrivate: boolean;
            memberIds: string[];
          },
          unknown
        >(functions, "createChannel");
        await createChannel({
          clubId,
          name: name.trim(),
          icon: selectedIcon.icon,
          iconType: selectedIcon.iconType,
          description: description.trim(),
          isPrivate,
          memberIds,
        });
      }
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      Alert.alert("Error", msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.formContainer} edges={["top", "bottom"]}>
        <View style={styles.formHeader}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.muted} />
          </Pressable>
          <Text style={styles.formTitle}>
            {existing ? "Edit Channel" : "New Channel"}
          </Text>
          <Pressable onPress={handleSave} disabled={saving} hitSlop={8}>
            {saving
              ? <ActivityIndicator size="small" color={colors.ocean} />
              : <Text style={styles.saveText}>Save</Text>
            }
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.formContent}>
          <Text style={styles.label}>NAME</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Leadership"
            placeholderTextColor={colors.muted}
            autoCapitalize="words"
            maxLength={40}
          />

          <Text style={styles.label}>DESCRIPTION (optional)</Text>
          <TextInput
            style={[styles.input, { minHeight: 60 }]}
            value={description}
            onChangeText={setDescription}
            placeholder="What is this channel for?"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={120}
          />

          <Text style={styles.label}>ICON</Text>
          <View style={styles.iconGrid}>
            {PRESET_ICONS.map((preset) => (
              <Pressable
                key={`${preset.iconType}-${preset.icon}`}
                style={[
                  styles.iconOption,
                  selectedIcon.icon === preset.icon && styles.iconOptionSelected,
                ]}
                onPress={() => setSelectedIcon(preset)}
              >
                <ChannelIcon
                  channel={{ icon: preset.icon, iconType: preset.iconType, name: "" }}
                  size={36}
                />
              </Pressable>
            ))}
          </View>

          {!existing && (
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Private channel</Text>
                <Text style={styles.switchHint}>Only invited members can see messages</Text>
              </View>
              <Switch
                value={isPrivate}
                onValueChange={setIsPrivate}
                trackColor={{ true: colors.ocean }}
              />
            </View>
          )}

          {(isPrivate || (existing?.isPrivate)) && (
            <>
              <Text style={styles.label}>MEMBERS</Text>
              {clubMembers.map((m) => (
                <Pressable
                  key={m.uid}
                  style={styles.memberRow}
                  onPress={() => toggleMember(m.uid)}
                >
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberInitial}>
                      {(m.displayName[0] ?? "?").toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.memberName}>{m.displayName}</Text>
                  <Ionicons
                    name={memberIds.includes(m.uid) ? "checkbox" : "square-outline"}
                    size={22}
                    color={memberIds.includes(m.uid) ? colors.ocean : colors.muted}
                  />
                </Pressable>
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
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
  channelName: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink },
  privateBadge: { fontSize: type.size.xs, color: colors.muted, marginTop: 2 },
  actionIcon: { padding: 4 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  addBtnText: { fontSize: type.size.md, color: colors.ocean, fontWeight: type.weight.bold },
  lockedNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  lockedText: { fontSize: type.size.sm, color: colors.muted },
  formContainer: { flex: 1, backgroundColor: colors.bg },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  formTitle: { fontSize: type.size.lg, fontWeight: type.weight.bold, color: colors.ink },
  saveText: { fontSize: type.size.md, color: colors.ocean, fontWeight: type.weight.bold },
  formContent: { padding: spacing.lg, gap: spacing.sm },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 1.2,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.ink,
    marginTop: spacing.xs,
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  iconOption: {
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: "transparent",
    padding: 4,
  },
  iconOptionSelected: {
    borderColor: colors.ocean,
    backgroundColor: colors.bgSoft,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: spacing.md,
  },
  switchLabel: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink },
  switchHint: { fontSize: type.size.xs, color: colors.muted, marginTop: 2 },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.ocean,
    alignItems: "center",
    justifyContent: "center",
  },
  memberInitial: { color: colors.white, fontWeight: type.weight.bold },
  memberName: { flex: 1, fontSize: type.size.md, color: colors.ink },
});
