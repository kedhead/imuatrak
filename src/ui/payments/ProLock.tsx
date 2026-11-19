import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../Button";
import { colors, spacing, type } from "../theme";

/** Payments are a Pro club feature; free clubs see this instead. */
export function ProLock({ canUpgrade }: { canUpgrade: boolean }) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.wrap}>
        <View style={styles.badge}>
          <Ionicons name="card-outline" size={40} color={colors.ocean} />
        </View>
        <Text style={styles.title}>Dues & Store is an ImuaTrak+ feature</Text>
        <Text style={styles.text}>
          Collect dues and sell club merch with the payment apps you already use (Zelle, Venmo,
          PayPal, Cash App). Members tap “I paid”, your treasurer confirms, and stock counts
          itself. No fees: ImuaTrak never touches the money.
        </Text>
        {canUpgrade ? (
          <Button title="Upgrade club" gradient="sunrise" glow onPress={() => router.push("/paywall")} style={styles.btn} />
        ) : (
          <Text style={styles.hint}>Ask a club owner or admin to upgrade.</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgSoft },
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  badge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  title: { fontSize: type.size.lg, fontWeight: type.weight.heavy, color: colors.ink, textAlign: "center" },
  text: { fontSize: type.size.sm, color: colors.muted, textAlign: "center", lineHeight: 20 },
  btn: { alignSelf: "stretch", marginTop: spacing.md },
  hint: { fontSize: type.size.sm, color: colors.ocean, fontWeight: type.weight.bold, marginTop: spacing.sm },
});
