import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gradient } from "./Gradient";
import { colors, radii, shadow, spacing, type, type GradientName } from "./theme";

interface Props {
  title: string;
  subtitle?: string;
  gradient?: GradientName;
  /** Element rendered on the right (icon actions, button…). */
  right?: React.ReactNode;
  /** Extra content below the title row, inside the gradient. */
  children?: React.ReactNode;
  style?: ViewStyle;
}

/** Hero gradient header with rounded bottom corners and an entrance animation. */
export function GradientHeader({
  title,
  subtitle,
  gradient = "ocean",
  right,
  children,
  style,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Gradient
      name={gradient}
      style={[styles.wrap, { paddingTop: insets.top + spacing.md }, style]}
    >
      <View style={styles.row}>
        <Animated.View entering={FadeInDown.duration(450)} style={styles.titleCol}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Animated.Text entering={FadeIn.delay(150)} style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Animated.Text>
          ) : null}
        </Animated.View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
      {children}
    </Gradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radii.xxl,
    borderBottomRightRadius: radii.xxl,
    ...shadow.md,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  titleCol: { flex: 1 },
  title: {
    color: colors.white,
    fontSize: type.size.display,
    fontWeight: type.weight.heavy,
    letterSpacing: type.spacing.tight,
  },
  subtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: type.size.md,
    marginTop: 2,
    fontWeight: type.weight.medium,
  },
  right: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginLeft: spacing.md },
});
