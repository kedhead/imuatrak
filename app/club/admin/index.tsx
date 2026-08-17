import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
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
import { deleteField } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/services/firebase";
import { useClub } from "@/services/clubStore";
import { updateClub, leaveClub, countExpiringMessages } from "@/services/clubService";
import { CHAT_RETENTION_OPTIONS } from "@/models/club";
import { currentUser } from "@/services/auth";
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
  const [retentionDays, setRetentionDays] = useState(club?.chatRetentionDays ?? 0);
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrated, setMigrated] = useState(false);

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
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setUploadingLogo(true);
    try {
      const user = currentUser();
      if (!user) throw new Error("Not signed in");
      const token = await user.getIdToken();

      // The Firebase JS SDK cannot create Blobs from ArrayBuffer in
      // React Native/Hermes, so we bypass it entirely and POST the file
      // binary directly to the Firebase Storage REST API via expo-file-system,
      // which does true native binary I/O without touching JS Blobs.
      const bucket = "imuatrak.firebasestorage.app";
      const path = `clubs/${club.id}/logo.jpg`;
      const uploadUrl =
        `https://firebasestorage.googleapis.com/v0/b/` +
        `${encodeURIComponent(bucket)}/o` +
        `?uploadType=media&name=${encodeURIComponent(path)}`;

      const upload = await FileSystem.uploadAsync(uploadUrl, uri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "image/jpeg",
        },
      });

      if (upload.status < 200 || upload.status >= 300) {
        throw new Error(`HTTP ${upload.status}: ${upload.body}`);
      }

      const meta = JSON.parse(upload.body) as { downloadTokens?: string };
      const token0 = meta.downloadTokens?.split(",")[0];
      if (!token0) throw new Error("No download token in response");
      const url =
        `https://firebasestorage.googleapis.com/v0/b/` +
        `${encodeURIComponent(bucket)}/o/${encodeURIComponent(path)}` +
        `?alt=media&token=${token0}`;
      setLogoUrl(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Upload failed", msg);
    } finally {
      setUploadingLogo(false);
    }
  };

  /**
   * Shortening retention deletes history on the next nightly sweep, so show
   * what it will cost before saving rather than letting a pill quietly do it.
   * Only asks when the window actually tightens — lengthening it, or turning
   * it off, can't delete anything.
   */
  const confirmRetentionChange = async (): Promise<boolean> => {
    const current = club?.chatRetentionDays ?? 0;
    if (retentionDays === current) return true;
    const isTightening = retentionDays > 0 && (current === 0 || retentionDays < current);
    if (!isTightening) return true;

    const count = await countExpiringMessages(club!.id, retentionDays).catch(() => -1);
    if (count === 0) return true;

    const scope =
      count < 0
        ? "Older messages will be deleted"
        : `Up to ${count} message${count === 1 ? "" : "s"} will be deleted`;
    return new Promise((resolve) => {
      Alert.alert(
        "Delete older chat?",
        `${scope} on the next nightly cleanup, along with any photos attached to them. Pinned messages are kept. This can't be undone.`,
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Delete older chat", style: "destructive", onPress: () => resolve(true) },
        ],
      );
    });
  };

  const handleSave = async () => {
    if (!(await confirmRetentionChange())) return;
    setSaving(true);
    try {
      const trimmedWebsite = websiteUrl.trim();
      const updates = {
        name: name.trim(),
        description: description.trim(),
        // Firestore rejects `undefined` — use deleteField() to remove optional
        // fields when the user clears them, and a plain value when they're set.
        websiteUrl: trimmedWebsite ? trimmedWebsite : deleteField(),
        logoUrl: logoUrl ? logoUrl : deleteField(),
        chatRetentionDays: retentionDays > 0 ? retentionDays : deleteField(),
      };
      await updateClub(club.id, updates);
      setClub(
        {
          ...club,
          websiteUrl: trimmedWebsite || undefined,
          logoUrl: logoUrl || undefined,
          chatRetentionDays: retentionDays > 0 ? retentionDays : undefined,
        },
        role!,
      );
      Alert.alert("Saved");
    } catch {
      Alert.alert("Error saving changes");
    } finally {
      setSaving(false);
    }
  };

  const handleMigrateMessages = async () => {
    Alert.alert(
      "Migrate Chat",
      "This will move all existing chat messages into the General channel. Run this once after upgrading.",
      [
        {
          text: "Migrate",
          onPress: async () => {
            setMigrating(true);
            try {
              const migrate = httpsCallable<{ clubId: string }, { migrated: number }>(
                functions,
                "migrateMessagesToGeneralChannel",
              );
              const result = await migrate({ clubId: club!.id });
              setMigrated(true);
              Alert.alert("Done", `Moved ${result.data.migrated} messages to General.`);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Unknown error";
              Alert.alert("Migration failed", msg);
            } finally {
              setMigrating(false);
            }
          },
        },
        { text: "Cancel", style: "cancel" },
      ],
    );
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
    : subStatus === "expired"
    ? "Subscription expired — tap to renew"
    : "Free plan — tap to unlock Pro & remove ads";
  const subAttention = subStatus === "expired";
  const subIcon =
    subStatus === "active" ? "checkmark-circle" : subStatus === "free" ? "sparkles-outline" : "time-outline";

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Subscription status — tappable to the paywall unless already active. */}
        <Pressable
          style={[styles.subBanner, subAttention && { backgroundColor: "#FEE2E2" }]}
          onPress={() => subStatus !== "active" && router.push("/paywall")}
          disabled={subStatus === "active"}
        >
          <Ionicons
            name={subIcon}
            size={18}
            color={subAttention ? colors.danger : colors.blue}
          />
          <Text style={[styles.subText, subAttention && { color: colors.danger }]}>
            {subLabel}
          </Text>
        </Pressable>

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

        {/* Invite — the screen itself is open to every member; staff also get
            the one-time expiring code section on it. */}
        <Text style={styles.sectionLabel}>INVITE MEMBERS</Text>
        <Pressable style={styles.inviteBtn} onPress={() => router.push("/club/invite")}>
          <Ionicons name="link-outline" size={18} color={colors.blue} />
          <Text style={styles.inviteBtnText}>Invite Link & QR Code</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: "auto" }} />
        </Pressable>

        {/* Channels */}
        <Text style={styles.sectionLabel}>CHANNELS</Text>
        <Pressable style={styles.inviteBtn} onPress={() => router.push("/club/admin/channels" as never)}>
          <Ionicons name="chatbubbles-outline" size={18} color={colors.blue} />
          <Text style={styles.inviteBtnText}>Manage Channels</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: "auto" }} />
        </Pressable>
        {role === "owner" && !migrated && (
          <Pressable
            style={[styles.inviteBtn, migrating && { opacity: 0.6 }]}
            onPress={() => void handleMigrateMessages()}
            disabled={migrating}
          >
            {migrating
              ? <ActivityIndicator size="small" color={colors.blue} />
              : <Ionicons name="arrow-forward-circle-outline" size={18} color={colors.blue} />
            }
            <Text style={styles.inviteBtnText}>
              {migrating ? "Migrating…" : "Migrate Chat to Channels"}
            </Text>
          </Pressable>
        )}
        {migrated && (
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: spacing.xs }}>
            Migration complete — messages are now in the General channel.
          </Text>
        )}

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

        <Text style={styles.sectionLabel}>CHAT HISTORY</Text>
        <View style={styles.retentionRow}>
          {CHAT_RETENTION_OPTIONS.map((o) => (
            <Pressable
              key={o.days}
              style={[styles.retentionPill, retentionDays === o.days && styles.retentionPillOn]}
              onPress={() => setRetentionDays(o.days)}
            >
              <Text
                style={[
                  styles.retentionPillText,
                  retentionDays === o.days && styles.retentionPillTextOn,
                ]}
              >
                {o.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.retentionHint}>
          {retentionDays === 0
            ? "Chat messages are kept indefinitely."
            : `Messages older than ${retentionDays} days are deleted nightly, along with their photos. Pinned messages are always kept.`}
        </Text>

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
  retentionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  retentionPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  retentionPillOn: { backgroundColor: colors.ocean, borderColor: colors.ocean },
  retentionPillText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  retentionPillTextOn: { color: colors.white },
  retentionHint: { fontSize: 12, color: colors.muted, marginTop: spacing.xs, lineHeight: 17 },
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
