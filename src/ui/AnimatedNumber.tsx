import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, type TextStyle } from "react-native";
import { colors, type } from "./theme";

interface Props {
  value: number;
  /** Map the animated number to a display string (e.g. add units). */
  format?: (n: number) => string;
  decimals?: number;
  duration?: number;
  style?: TextStyle;
}

/**
 * Counts up to `value` whenever it changes. Runs entirely on the JS thread
 * via requestAnimationFrame so the `format` callback can be any plain
 * function. (Calling a non-worklet function inside a Reanimated UI worklet
 * throws and hard-crashes the app, so we deliberately avoid worklets here.)
 */
export function AnimatedNumber({
  value,
  format,
  decimals = 0,
  duration = 800,
  style,
}: Props) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
    const start = Date.now();

    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / duration);
      // easeOutCubic — matches the previous feel
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      fromRef.current = to;
    };
  }, [value, duration]);

  const safeFormat = (n: number): string => {
    try {
      return format ? format(n) : n.toFixed(decimals);
    } catch {
      return "—";
    }
  };

  return (
    <Text style={[styles.text, style]} numberOfLines={1}>
      {safeFormat(display)}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    color: colors.ink,
    fontWeight: type.weight.heavy,
    padding: 0,
    ...type.mono,
  },
});
