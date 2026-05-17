import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useClub } from "@/services/clubStore";
import { updateClub, leaveClub, createInviteToken } from "@/services/clubService";
import { currentUser } from "@/services/auth";
import { colors, spacing, radii } from "@/ui/theme";

export default function ClubAdminScreen() {
  const router = useRouter();
  const club = useClub((s) => s.club);
  const role = useClub((s) => s.role);
  const clearClub = useClub((s) => s.clearClub);

  const [name, setName] = useState(club?.name ?? "");
  const [description, setDescription] = useState(club?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);

  if (!club || (role !== "owner" && role !== "admin")) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.muted }}>Admin access required</Text>
      </View>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateClub(club.id, { name: name.trim(), description: description.trim() });
      Alert.alert("Saved");
    } catch {
      Alert.alert("Error saving changes");
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async () => {
    setInviting(true);
    try {
      const token = await createInviteToken(club.id);
      await Share.share({
        message: `Join ${club.name} on ImuaTrak! Use invite code: ${token}`,
      });
    } catch {
      Alert.alert("Error generating invite");
    } finally {
      setInviting(false);
    }
  };

  const handleLeave = () => {
    if (role === "owner") {
      Alert.alert("Can't leave", "Transfer ownership before leaving.");
      return;
    }
    const me = currentUser();
    if (!me) return;
    Alert.alert("Leave Club", `Leave ${club.name}?`, [
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          await leaveClub(club.id, me.uid);
          clearClub();
          router.back();
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const subStatus = club.subscriptionStatus;
  const subLabel = subStatus === "trial"
    ? `Free trial — expires ${club.trialEndsAt ? new Date(club.trialEndsAt).toLocaleDateString() : "soon"}`
    : subStatus === "active"
    ? "Active subscription"
    : "Subscription expired";

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Subscription status */}
        <View style={[styles.subBanner, subStatus === "expired" && { backgroundColor: "#FEE2E2" }]}>
          <Ionicons
            name={subStatus === "active" ? "checkmark-circle" : "time-outline"}
            size={18}
            color={subStatus === "expired" ? colors.danger : colors.blue}
          />
          <Text style={[styles.subText, subStatus === "expired" && { color: colors.danger }]}>
            {subLabel}
          </Text>
        </View>

        {/* Invite */}
        <Text style={styles.sectionLabel}>INVITE MEMBERS</Text>
        <Pressable style={[styles.inviteBtn, inviting && { opacity: 0.6 }]} onPress={handleInvite} disabled={inviting}>
          {inviting ? <ActivityIndicator color={colors.blue} /> : <Ionicons name="link-outline" size={18} color={colors.blue} />}
          <Text style={styles.inviteBtnText}>Generate Invite Link</Text>
        </Pressable>

        {/* Club settings */}
        <Text style={styles.sectionLabel}>CLUB NAME</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Club name"
          placeholderTextColor={colors.muted}
          autoCapitalize="words"
        />

        <Text style={styles.sectionLabel}>DESCRIPTION</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          placeholder="About your club"
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={3}
        />

        <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
        </Pressable>

        <Pressable style={styles.leaveBtn} onPress={handleLeave}>
          <Text style={styles.leaveBtnText}>Leave Club</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: spacing.lg, gap: spacing.xs },
  subBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: "#EBF3FB", borderRadius: radii.md, padding: spacing.md },
  subText: { fontSize: 14, color: colors.blue, fontWeight: "600", flex: 1 },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: colors.muted, letterSpacing: 1.2, marginTop: spacing.lg },
  inviteBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.xs },
  inviteBtnText: { fontSize: 15, fontWeight: "600", color: colors.blue },
  input: { backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.md, fontSize: 16, color: colors.ink, marginTop: spacing.xs },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  saveBtn: { backgroundColor: colors.blue, borderRadius: radii.md, paddingVertical: spacing.md + 2, alignItems: "center", marginTop: spacing.xl },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 17 },
  leaveBtn: { borderWidth: 1.5, borderColor: colors.danger, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: "center", marginTop: spacing.md },
  leaveBtnText: { color: colors.danger, fontWeight: "700", fontSize: 15 },
});
