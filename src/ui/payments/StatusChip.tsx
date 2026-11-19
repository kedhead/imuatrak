import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import type { PayOrderStatus } from "@/models/payments";
import { colors, radii, spacing, type } from "../theme";

const LOOK: Record<PayOrderStatus | "unpaid", { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  confirmed: { label: "Paid", color: colors.success, icon: "checkmark-circle" },
  pending: { label: "Pending", color: colors.mango, icon: "time-outline" },
  cancelled: { label: "Withdrawn", color: colors.muted, icon: "close-circle-outline" },
  unpaid: { label: "Unpaid", color: colors.coral, icon: "alert-circle-outline" },
};

export function StatusChip({ status }: { status: PayOrderStatus | "unpaid" }) {
  const look = LOOK[status];
  return (
    <View style={[styles.chip, { backgroundColor: look.color + "1F" }]}>
      <Ionicons name={look.icon} size={12} color={look.color} />
      <Text style={[styles.text, { color: look.color }]}>{look.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  text: { fontSize: type.size.xs, fontWeight: type.weight.bold },
});
