import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useClub } from "@/services/clubStore";
import { updateClub, leaveClub } from "@/services/clubService";
import { currentUser } from "@/services/auth";
import { storage } from "@/services/firebase";
import { colors, spacing, radii } from "@/ui/theme";

export default function ClubAdminScreen() {
  const router = useRouter();
  const club = useClub((s) => s.club);
  const role = useClub((s) => s.role);
  const setClub = useClub((s) => s.setClub);
  const clearClub = useClub((s) => s.clearClub);

  const [name, setName] = useState(club?.name ?? "");
  const [description, setDescription] = useState(club?.description ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(club?.websiteUrl ?? "");
  const [logoUrl, setLogoUrl] = useState(club?.logoUrl ?? "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!club || (role !== "owner" && role !== "admin")) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.muted }}>Admin access required</Text>
      </View>
    );
  }

  const handlePickLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access to upload a club logo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setUploadingLogo(true);
    try {
      const resp = await fetch(uri);
      const blob = await resp.blob();
      const logoRef = ref(storage, `clubs/${club.id}/logo.jpg`);
      await uploadBytes(logoRef, blob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(logoRef);
      setLogoUrl(url);
    } catch {
      Alert.alert("Upload failed", "Could not upload logo. Try again.");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = {
        name: name.trim(),
        description: description.trim(),
        websiteUrl: websiteUrl.trim() || undefined,
        logoUrl: logoUrl || undefined,
      };
      await updateClub(club.id, updates);
      setClub({ ...club, ...updates }, role!);
      Alert.alert("Saved");
    } catch {
      Alert.alert("Error saving changes");
    } finally {
      setSaving(false);
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

        {/* Club logo */}
        <Text style={styles.sectionLabel}>CLUB LOGO</Text>
        <Pressable style={styles.logoWrap} onPress={handlePickLogo} disabled={uploadingLogo}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.logoImage} />
          ) : (
            <View style={styles.logoPlaceholder}>
              <Ionicons name="image-outline" size={36} color={colors.muted} />
            </View>
          )}
          <View style={styles.logoBadge}>
            {uploadingLogo
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="camera" size={16} color="#fff" />}
          </View>
        </Pressable>
        <Text style={styles.logoHint}>Tap to upload a square logo (JPG or PNG)</Text>

        {/* Invite */}
        <Text style={styles.sectionLabel}>INVITE MEMBERS</Text>
        <Pressable style={styles.inviteBtn} onPress={() => router.push("/club/admin/invite")}>
          <Ionicons name="link-outline" size={18} color={colors.blue} />
          <Text style={styles.inviteBtnText}>Generate Invite Link</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: "auto" }} />
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

        <Text style={styles.sectionLabel}>WEBSITE</Text>
        <TextInput
          style={styles.input}
          value={websiteUrl}
          onChangeText={setWebsiteUrl}
          placeholder="https://yourclub.com"
          placeholderTextColor={colors.muted}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
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
  logoWrap: { alignSelf: "flex-start", marginTop: spacing.xs },
  logoImage: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.card },
  logoPlaceholder: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  logoBadge: { position: "absolute", bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.bg },
  logoHint: { fontSize: 12, color: colors.muted, marginTop: spacing.xs },
  inviteBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.xs },
  inviteBtnText: { fontSize: 15, fontWeight: "600", color: colors.blue },
  input: { backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.md, fontSize: 16, color: colors.ink, marginTop: spacing.xs },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  saveBtn: { backgroundColor: colors.blue, borderRadius: radii.md, paddingVertical: spacing.md + 2, alignItems: "center", marginTop: spacing.xl },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 17 },
  leaveBtn: { borderWidth: 1.5, borderColor: colors.danger, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: "center", marginTop: spacing.md },
  leaveBtnText: { color: colors.danger, fontWeight: "700", fontSize: 15 },
});
