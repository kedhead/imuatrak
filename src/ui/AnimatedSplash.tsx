import { useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";
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
import { shadow } from "./theme";

// The app icon's artwork (canoe, paddle and wordmark), the same image the
// native splash shows first, so launch doesn't switch from the icon art to a
// different mark when this overlay takes over.
const ICON_ART = require("../../assets/icon.png");
const TILE = 200;

/**
 * Branded animated splash shown over the app while it boots. The icon tile
 * scales in and then bobs gently; the whole overlay cross-fades out when
 * `hidden`.
 */
export function AnimatedSplash({ hidden }: { hidden: boolean }) {
  const scale = useSharedValue(0.6);
  const bob = useSharedValue(0);

  useEffect(() => {
    scale.value = withSequence(
      withTiming(1.08, { duration: 480, easing: Easing.out(Easing.back(1.6)) }),
      withTiming(1, { duration: 220 }),
    );
    bob.value = withDelay(
      700,
      withRepeat(withTiming(-6, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, true),
    );
  }, [scale, bob]);

  const tileStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: bob.value }],
  }));

  if (hidden) {
    return (
      <Animated.View exiting={FadeOut.duration(450)} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Gradient name="night" style={styles.fill}>
          <Content tileStyle={tileStyle} />
        </Gradient>
      </Animated.View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Gradient name="night" style={styles.fill}>
        <Content tileStyle={tileStyle} />
      </Gradient>
    </View>
  );
}

function Content({ tileStyle }: { tileStyle: any }) {
  return (
    <Animated.View style={[styles.shadow, tileStyle]}>
      <Image source={ICON_ART} style={styles.tile} resizeMode="cover" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: "center", justifyContent: "center" },
  // The shadow sits on an unclipped wrapper; the image clips to the rounded
  // corners (iOS can't draw a shadow on a view that clips its children).
  shadow: { borderRadius: TILE * 0.225, ...shadow.lg },
  // 22.5% corner radius approximates the iOS home-screen icon shape.
  tile: { width: TILE, height: TILE, borderRadius: TILE * 0.225 },
});
