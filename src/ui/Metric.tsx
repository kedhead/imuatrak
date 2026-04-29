import { StyleSheet, Text, View } from "react-native";
import { colors } from "./theme";

interface Props {
  label: string;
  value: string;
}

export function Metric({ label, value }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEF1F4",
  },
  label: { color: colors.muted, fontSize: 14 },
  value: { fontSize: 26, fontWeight: "700", fontVariant: ["tabular-nums"], color: colors.ink },
});
