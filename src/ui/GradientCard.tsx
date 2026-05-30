import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { AnimatedPressable } from "./AnimatedPressable";
import { Gradient } from "./Gradient";
import { colors, radii, shadow, spacing, type GradientName } from "./theme";

interface Props {
  children: React.ReactNode;
  /** Paint a gradient instead of a white surface. */
  gradient?: GradientName;
  /** Colored left accent bar (e.g. per-craft color). */
  accent?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}

/** Rounded, elevated card. White by default; gradient for hero content. */
export function GradientCard({
  children,
  gradient,
  accent,
  onPress,
  style,
  padded = true,
}: Props) {
  const inner = (
    <View style={styles.row}>
      {accent && <View style={[styles.accent, { backgroundColor: accent }]} />}
      <View style={[styles.content, padded && styles.padded]}>{children}</View>
    </View>
  );

  const cardStyle = [styles.card, !gradient && styles.white, style];

  const body = gradient ? (
    <Gradient name={gradient} style={styles.fill}>
      {inner}
    </Gradient>
  ) : (
    inner
  );

  if (onPress) {
    return (
      <AnimatedPressable onPress={onPress} style={cardStyle}>
        {body}
      </AnimatedPressable>
    );
  }
  return <View style={cardStyle}>{body}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    overflow: "hidden",
    ...shadow.md,
  },
  white: { backgroundColor: colors.white },
  fill: { flex: 1 },
  row: { flexDirection: "row" },
  accent: { width: 5 },
  content: { flex: 1 },
  padded: { padding: spacing.lg },
});
