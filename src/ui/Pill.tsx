import { StyleSheet, Text, View } from "react-native";
import { AnimatedPressable } from "./AnimatedPressable";
import { Gradient } from "./Gradient";
import { colors, radii, spacing, type, type GradientName } from "./theme";

interface Props {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  gradient?: GradientName;
  style?: object;
}

/** Selectable chip. Fills with a gradient when active. Used for craft/unit toggles. */
export function Pill({ label, selected, onPress, gradient = "aqua", style }: Props) {
  const content = (
    <Text style={[styles.label, selected && styles.labelOn]} numberOfLines={1}>
      {label}
    </Text>
  );

  if (!onPress) {
    return (
      <View style={[styles.base, !selected && styles.off, style]}>
        {selected ? <Gradient name={gradient} style={styles.fill}>{content}</Gradient> : content}
      </View>
    );
  }

  return (
    <AnimatedPressable haptic onPress={onPress} style={[styles.base, !selected && styles.off, style]}>
      {selected ? (
        <Gradient name={gradient} style={styles.fill}>
          {content}
        </Gradient>
      ) : (
        content
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  off: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  fill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    textAlign: "center",
    color: colors.inkSoft,
    fontSize: type.size.sm,
    fontWeight: type.weight.bold,
  },
  labelOn: {
    color: colors.white,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
});
