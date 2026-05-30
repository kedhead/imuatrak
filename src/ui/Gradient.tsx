import { LinearGradient } from "expo-linear-gradient";
import type { ViewStyle, StyleProp } from "react-native";
import { gradients, type GradientName } from "./theme";

interface Props {
  name?: GradientName;
  /** Override with explicit stops if you don't want a named gradient. */
  colors?: readonly string[];
  /** Diagonal by default for a sense of motion. */
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  pointerEvents?: "auto" | "none" | "box-none" | "box-only";
}

/**
 * Thin wrapper over expo-linear-gradient that resolves a named gradient from
 * the theme. Diagonal top-left → bottom-right by default.
 */
export function Gradient({
  name = "ocean",
  colors,
  start = { x: 0, y: 0 },
  end = { x: 1, y: 1 },
  style,
  children,
  pointerEvents,
}: Props) {
  const stops = (colors ?? gradients[name]) as readonly [string, string, ...string[]];
  return (
    <LinearGradient colors={stops} start={start} end={end} style={style} pointerEvents={pointerEvents}>
      {children}
    </LinearGradient>
  );
}
