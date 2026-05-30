import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Gradient } from "./Gradient";
import { Logo } from "./Logo";
import { colors, type } from "./theme";

/**
 * Branded animated splash shown over the app while it boots. The logo scales
 * in and the wordmark fades up; the whole overlay cross-fades out when `hidden`.
 */
export function AnimatedSplash({ hidden }: { hidden: boolean }) {
  const scale = useSharedValue(0.6);
  const bob = useSharedValue(0);
  const wordmark = useSharedValue(0);

  useEffect(() => {
    scale.value = withSequence(
      withTiming(1.08, { duration: 480, easing: Easing.out(Easing.back(1.6)) }),
      withTiming(1, { duration: 220 }),
    );
    bob.value = withDelay(
      700,
      withRepeat(withTiming(-6, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, true),
    );
    wordmark.value = withDelay(420, withTiming(1, { duration: 500 }));
  }, [scale, bob, wordmark]);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: bob.value }],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordmark.value,
    transform: [{ translateY: (1 - wordmark.value) * 12 }],
  }));

  if (hidden) {
    return (
      <Animated.View exiting={FadeOut.duration(450)} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Gradient name="night" style={styles.fill}>
          <Content logoStyle={logoStyle} wordStyle={wordStyle} />
        </Gradient>
      </Animated.View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Gradient name="night" style={styles.fill}>
        <Content logoStyle={logoStyle} wordStyle={wordStyle} />
      </Gradient>
    </View>
  );
}

function Content({ logoStyle, wordStyle }: { logoStyle: any; wordStyle: any }) {
  return (
    <>
      <Animated.View style={logoStyle}>
        <Logo size={132} />
      </Animated.View>
      <Animated.Text style={[styles.word, wordStyle]}>ImuaTrak</Animated.Text>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: "center", justifyContent: "center" },
  word: {
    marginTop: 20,
    color: colors.white,
    fontSize: type.size.display,
    fontWeight: type.weight.heavy,
    letterSpacing: type.spacing.tight,
  },
});
