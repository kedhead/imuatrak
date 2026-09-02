import { StyleSheet, Text, View } from "react-native";
import type { RsvpStatus } from "@/models/club";
import { colors, radii, spacing, type } from "@/ui/theme";

const META: Record<RsvpStatus, { label: string; color: string; bg: string }> = {
  going: { label: "✓ You're going", color: "#0E7A57", bg: "rgba(31,182,166,0.16)" },
  maybe: { label: "? You're a maybe", color: "#B4780A", bg: "rgba(255,194,75,0.22)" },
  not_going: { label: "✗ You can't go", color: colors.coral, bg: "rgba(255,107,94,0.14)" },
};

/**
 * Compact marker showing the viewer's own RSVP for an event, so they can see
 * their status from the card without opening it. `undefined` = not responded.
 */
export function RsvpBadge({ status }: { status?: RsvpStatus }) {
  const m = status ? META[status] : null;
  return (
    <View style={[styles.badge, { backgroundColor: m ? m.bg : colors.bgSoft }]}>
      <Text style={[styles.text, { color: m ? m.color : colors.muted }]}>
        {m ? m.label : "Tap to RSVP"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  text: { fontSize: type.size.xs, fontWeight: type.weight.bold },
});
