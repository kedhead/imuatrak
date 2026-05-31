import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors, radii, spacing, type } from "./theme";

interface Props {
  label: string;
  color?: string;
  /** Solid filled badge vs. tinted soft badge. */
  variant?: "solid" | "soft";
  style?: ViewStyle;
}

/** Small status / category label. */
export function Badge({ label, color = colors.ocean, variant = "solid", style }: Props) {
  const soft = variant === "soft";
  return (
    <View
      style={[
        styles.base,
        soft ? { backgroundColor: color + "22" } : { backgroundColor: color },
        style,
      ]}
    >
      <Text style={[styles.text, { color: soft ? color : colors.white }]}>{(label ?? "").toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  text: {
    fontSize: 10,
    fontWeight: type.weight.heavy,
    letterSpacing: type.spacing.label,
  },
});
