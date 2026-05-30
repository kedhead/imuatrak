import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, type TextStyle } from "react-native";
import {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { colors, type } from "./theme";

interface Props {
  value: number;
  /** Map the animated number to a display string (e.g. add units). */
  format?: (n: number) => string;
  decimals?: number;
  duration?: number;
  style?: TextStyle;
}

function safeNum(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/**
 * Counts up to `value` whenever it changes, applying `format` on the JS
 * thread so regular (non-worklet) functions can be passed as `format`.
 */
export function AnimatedNumber({
  value,
  format,
  decimals = 0,
  duration = 800,
  style,
}: Props) {
  const initial = safeNum(value);
  const progress = useSharedValue(initial);

  const formatRef = useRef(format);
  const decimalsRef = useRef(decimals);
  formatRef.current = format;
  decimalsRef.current = decimals;

  const [text, setText] = useState(() => {
    const fn = formatRef.current;
    return fn ? fn(initial) : initial.toFixed(decimalsRef.current);
  });

  const update = useCallback((raw: number) => {
    const n = safeNum(raw);
    const fn = formatRef.current;
    setText(fn ? fn(n) : n.toFixed(decimalsRef.current));
  }, []);

  useEffect(() => {
    progress.value = withTiming(safeNum(value), {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, duration, progress]);

  useAnimatedReaction(
    () => progress.value,
    (current) => {
      runOnJS(update)(current);
    },
    [update],
  );

  return <Text style={[styles.text, style]}>{text}</Text>;
}

const styles = StyleSheet.create({
  text: {
    color: colors.ink,
    fontWeight: type.weight.heavy,
    padding: 0,
    ...type.mono,
  },
});
