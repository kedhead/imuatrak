import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, type } from "./theme";

interface Props {
  label: string;
  value: string;
  icon?: keyof typeof Ionicons.glyphMap;
  accent?: string;
}

/** A single labelled stat row with an optional colored icon chip. */
export function Metric({ label, value, icon, accent = colors.ocean }: Props) {
  return (
    <View style={styles.row}>
      {icon ? (
        <View style={[styles.iconChip, { backgroundColor: accent + "1A" }]}>
          <Ionicons name={icon} size={18} color={accent} />
        </View>
      ) : null}
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    gap: spacing.sm,
  },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { color: colors.muted, fontSize: type.size.md, flex: 1 },
  value: {
    fontSize: type.size.xxl,
    fontWeight: type.weight.heavy,
    color: colors.ink,
    ...type.mono,
  },
});
