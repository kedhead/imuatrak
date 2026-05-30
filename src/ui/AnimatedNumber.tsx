import { useEffect } from "react";
import { StyleSheet, type TextStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { TextInput } from "react-native";
import { colors, type } from "./theme";

Animated.addWhitelistedNativeProps({ text: true });
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface Props {
  value: number;
  /** Map the animated number to a display string (e.g. add units). */
  format?: (n: number) => string;
  decimals?: number;
  duration?: number;
  style?: TextStyle;
}

/**
 * Counts up to `value` whenever it changes. Renders into an uneditable
 * TextInput so the text can be driven from the UI thread via animatedProps.
 */
export function AnimatedNumber({
  value,
  format,
  decimals = 0,
  duration = 800,
  style,
}: Props) {
  const progress = useSharedValue(value);

  useEffect(() => {
    progress.value = withTiming(value, { duration, easing: Easing.out(Easing.cubic) });
  }, [value, duration, progress]);

  const animatedProps = useAnimatedProps(() => {
    const n = progress.value;
    const text = format ? format(n) : n.toFixed(decimals);
    return { text, defaultValue: text } as any;
  });

  return (
    <AnimatedTextInput
      editable={false}
      underlineColorAndroid="transparent"
      style={[styles.text, style]}
      animatedProps={animatedProps}
    />
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
