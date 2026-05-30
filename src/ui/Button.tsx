import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { AnimatedPressable } from "./AnimatedPressable";
import { Gradient } from "./Gradient";
import { colors, radii, shadow, spacing, type, type GradientName } from "./theme";

interface Props {
  title: string;
  onPress: () => void;
  /** `gradient` is the new vibrant default-style; the originals still work. */
  variant?: "gradient" | "primary" | "outline" | "danger";
  gradient?: GradientName;
  disabled?: boolean;
  /** Add a colored glow shadow (great for primary CTAs). */
  glow?: boolean;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = "gradient",
  gradient = "aqua",
  disabled,
  glow,
  style,
}: Props) {
  const isGradient = variant === "gradient";

  const label = (
    <Text
      style={[
        styles.label,
        (variant === "gradient" || variant === "primary") && styles.labelLight,
        variant === "outline" && styles.labelOutline,
        variant === "danger" && styles.labelDanger,
      ]}
    >
      {title}
    </Text>
  );

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      haptic={!disabled}
      style={[
        styles.base,
        variant === "primary" && styles.primary,
        variant === "outline" && styles.outline,
        variant === "danger" && styles.danger,
        isGradient && styles.gradientWrap,
        glow && (variant === "danger" ? shadow.glowCoral : shadow.glowAqua),
        disabled && styles.disabled,
        style,
      ]}
    >
      {isGradient ? (
        <Gradient name={gradient} style={styles.fill}>
          {label}
        </Gradient>
      ) : (
        <View style={styles.fill}>{label}</View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.pill,
    minHeight: 52,
    overflow: "hidden",
    justifyContent: "center",
  },
  fill: {
    flex: 1,
    paddingVertical: 15,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  gradientWrap: { ...shadow.sm },
  primary: { backgroundColor: colors.ocean },
  outline: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.ocean },
  danger: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.danger },
  disabled: { opacity: 0.5 },
  label: { fontWeight: type.weight.bold, fontSize: type.size.lg, letterSpacing: type.spacing.wide },
  labelLight: { color: colors.white },
  labelOutline: { color: colors.ocean },
  labelDanger: { color: colors.danger },
});
