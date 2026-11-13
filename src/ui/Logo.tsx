import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { shadow as shadows } from "./theme";

// The app icon's artwork (canoe, paddle, wave and wordmark) — the same image
// as the home-screen icon and the splash, so the brand mark matches
// everywhere instead of an older hand-drawn SVG standing in for it.
const ICON_ART = require("../../assets/icon.png");
// The full logo on transparency (canoe, paddle, wave and IMUATRAK wordmark,
// with its own glow): the same mark as the launch artwork.
const LOGO_ART = require("../../assets/logo-transparent.png");
const LOGO_ASPECT = 960 / 717;

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

/**
 * The full ImuaTrak logo on transparency, for dark brand surfaces (sign-in,
 * email sign-in) right after the launch screen, which shows the same mark.
 * `width` sets the size; height follows the artwork's aspect ratio.
 */
export function BrandLogo({ width = 280, style }: { width?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <Image
        source={LOGO_ART}
        style={{ width, height: width / LOGO_ASPECT }}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="ImuaTrak"
      />
    </View>
  );
}
