import { router } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors, spacing, type } from "./theme";

/**
 * A quiet "Remove ads" link shown next to an ad, opening the paywall. It sits
 * OUTSIDE the ad's own view, so it can't be mistaken for (or counted as part
 * of) the ad.
 */
export function RemoveAdsLink({ align = "center" }: { align?: "center" | "flex-end" }) {
  return (
    <Pressable
      onPress={() => router.push("/paywall")}
      hitSlop={8}
      style={[styles.link, { alignSelf: align }]}
      accessibilityRole="link"
    >
      <Text style={styles.text}>Remove ads</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { paddingVertical: spacing.xs },
  text: { fontSize: type.size.xs, color: colors.muted, textDecorationLine: "underline" },
});
