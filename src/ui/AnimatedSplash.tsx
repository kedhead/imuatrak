import { useRef } from "react";
import { Image, Platform, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

// Full-bleed launch artwork (sunrise, canoe and wordmark). On iOS the native
// launch screen shows this same image (app.config.js → expo-splash-screen), so
// the hand-off is invisible. Android 12+ can't show a full-screen image
// natively, so its native screen is plain SPLASH_BG and the artwork fades up
// from that colour.
const SPLASH_ART = require("../../assets/splash-art.jpg");
/** The native Android splash background; matches the artwork's deep blue. */
const SPLASH_BG = "#001D5B";

// iOS's native screen is already this exact frame, so start fully shown there;
// Android fades the artwork up from the plain-blue native screen.
const START_OPACITY = Platform.OS === "ios" ? 1 : 0;

/**
 * Branded splash shown over the app while it boots. The artwork drifts in
 * slowly (starting from exactly the native frame), then the whole overlay
 * cross-fades out when `hidden`. `onReady` fires once the artwork has drawn,
 * which is when it's safe to drop the native splash without a blank frame.
 */
export function AnimatedSplash({ onReady }: { hidden?: boolean; onReady?: () => void }) {
  const opacity = useSharedValue(START_OPACITY);
  const scale = useSharedValue(1);
  const started = useRef(false);

  // Start once the artwork has actually drawn, then let the native splash go.
  const onArtLoaded = () => {
    if (started.current) return;
    started.current = true;
    opacity.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) });
    scale.value = withTiming(1.05, { duration: 3000, easing: Easing.out(Easing.cubic) });
    onReady?.();
  };

  const artStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  // One stable tree: the parent unmounts this when the app is ready, and the
  // exiting animation cross-fades it out. (Swapping wrappers mid-way would
  // remount the image and could blink.)
  return (
    <Animated.View exiting={FadeOut.duration(450)} style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, artStyle]}>
          <Image
            source={SPLASH_ART}
            style={styles.art}
            resizeMode="cover"
            fadeDuration={0}
            onLoadEnd={onArtLoaded}
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: SPLASH_BG, overflow: "hidden" },
  art: { width: "100%", height: "100%" },
});
