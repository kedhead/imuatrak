import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { currentUser } from "@/services/auth";
import { createClub } from "@/services/clubService";
import { useClub } from "@/services/clubStore";
import { colors, spacing, radii } from "@/ui/theme";

export default function CreateClubScreen() {
  const router = useRouter();
  const switchClub = useClub((s) => s.switchClub);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert("Club name required");
      return;
    }
    const user = currentUser();
    if (!user) {
      Alert.alert("Please sign in first");
      return;
    }
    setLoading(true);
    try {
      const club = await createClub(user.uid, user.displayName ?? "Club Owner", {
        name: name.trim(),
        description: description.trim(),
        city: city.trim(),
        country: country.trim(),
      });
      await switchClub(club.id, user.uid);
      router.back();
    } catch (e) {
      Alert.alert("Error", "Failed to create club. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionLabel}>CLUB NAME *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Waikiki Beach Boys"
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          <Text style={styles.sectionLabel}>DESCRIPTION</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="What's your club about?"
            placeholderTextColor={colors.muted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />

          <Text style={styles.sectionLabel}>LOCATION</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="City"
              placeholderTextColor={colors.muted}
              value={city}
              onChangeText={setCity}
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Country"
              placeholderTextColor={colors.muted}
              value={country}
              onChangeText={setCountry}
            />
          </View>

          <View style={styles.trialNote}>
            <Text style={styles.trialText}>
              Your club starts on a free 30-day trial. Club features include event scheduling, news feed, and member management.
            </Text>
          </View>

          <Pressable
            style={[styles.btn, loading && { opacity: 0.6 }]}
            onPress={handleCreate}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Create Club</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.xs },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: colors.muted, letterSpacing: 1.2, marginTop: spacing.lg, marginBottom: spacing.xs },
  input: { backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.md, fontSize: 16, color: colors.ink },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: spacing.sm },
  trialNote: { backgroundColor: "#EBF3FB", borderRadius: radii.md, padding: spacing.md, marginTop: spacing.lg },
  trialText: { fontSize: 14, color: colors.blue, lineHeight: 20 },
  btn: { backgroundColor: colors.blue, borderRadius: radii.md, paddingVertical: spacing.md + 2, alignItems: "center", marginTop: spacing.xl },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 17 },
});
