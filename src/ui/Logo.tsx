import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { shadow as shadows } from "./theme";

// The app icon's artwork (canoe, paddle, wave and wordmark) — the same image
// as the home-screen icon and the splash, so the brand mark matches
// everywhere instead of an older hand-drawn SVG standing in for it.
const ICON_ART = require("../../assets/icon.png");

interface Props {
  size?: number;
  /** Drop shadow under the tile. Off on surfaces that already have depth. */
  shadow?: "none" | "md" | "lg" | "glowAqua";
  style?: StyleProp<ViewStyle>;
}

/**
 * ImuaTrak brand mark, drawn as a rounded tile like the app icon. The 22.5%
 * corner radius approximates the iOS home-screen icon shape and matches
 * AnimatedSplash, so launch → sign-in reads as one continuous mark.
 */
export function Logo({ size = 96, shadow = "md", style }: Props) {
  const radius = size * 0.225;
  return (
    // The shadow sits on an unclipped wrapper; the image clips to the corners
    // (iOS can't draw a shadow on a view that clips its children).
    <View style={[{ borderRadius: radius }, shadow !== "none" && shadows[shadow], style]}>
      <Image
        source={ICON_ART}
        style={[styles.image, { width: size, height: size, borderRadius: radius }]}
        resizeMode="cover"
        accessibilityRole="image"
        accessibilityLabel="ImuaTrak"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { overflow: "hidden" },
});
