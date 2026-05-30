import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Gradient } from "./Gradient";
import { colors, type GradientName } from "./theme";

interface Props {
  /** When set, paints a full-screen gradient; otherwise a soft solid color. */
  gradient?: GradientName;
  color?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/** Full-screen backdrop. Use a gradient for hero screens, solid for content. */
export function ScreenBackground({ gradient, color = colors.bgSoft, style, children }: Props) {
  if (gradient) {
    return (
      <Gradient name={gradient} style={[styles.fill, style]}>
        {children}
      </Gradient>
    );
  }
  return <View style={[styles.fill, { backgroundColor: color }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
