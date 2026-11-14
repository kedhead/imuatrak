import { Image } from "expo-image";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { shadow as shadows } from "./theme";

// The app icon's artwork (the new logo on the ocean gradient), the same image
// as the home-screen icon, drawn as a rounded tile inside the app.
const ICON_ART = require("../../assets/icon.png");
// The full logo on transparency (canoe, paddle, wave and IMUATRAK wordmark,
// with its own glow): the same mark as the launch artwork.
const LOGO_ART = require("../../assets/logo-transparent.png");
const LOGO_ASPECT = 720 / 538;

// Both marks render with expo-image and a fixed recyclingKey. With React
// Native's Image, iOS reuses native image views between screens, and the boot
// screen's square icon tile showed through in the sign-in screen's logo slot
// (square, unrounded) until the new image arrived.

interface Props {
  size?: number;
  /** Drop shadow under the tile. Off on surfaces that already have depth. */
  shadow?: "none" | "md" | "lg" | "glowAqua";
  style?: StyleProp<ViewStyle>;
}

/**
 * ImuaTrak brand mark, drawn as a rounded tile like the app icon. The 22.5%
 * corner radius approximates the iOS home-screen icon shape.
 */
export function Logo({ size = 96, shadow = "md", style }: Props) {
  const radius = size * 0.225;
  return (
    // The shadow sits on an unclipped wrapper; the image clips to the corners
    // (iOS can't draw a shadow on a view that clips its children).
    <View style={[{ borderRadius: radius }, shadow !== "none" && shadows[shadow], style]}>
      <Image
        source={ICON_ART}
        style={[styles.tile, { width: size, height: size, borderRadius: radius }]}
        contentFit="cover"
        cachePolicy="memory"
        recyclingKey="imuatrak-icon-tile"
        transition={0}
        accessibilityRole="image"
        accessibilityLabel="ImuaTrak"
      />
    </View>
  );
}

/**
 * The full ImuaTrak logo on transparency, for dark brand surfaces (boot,
 * sign-in, email sign-in) right after the launch screen, which shows the same
 * mark. `width` sets the size; height follows the artwork's aspect ratio.
 */
export function BrandLogo({ width = 280, style }: { width?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <Image
        source={LOGO_ART}
        style={{ width, height: width / LOGO_ASPECT }}
        contentFit="contain"
        cachePolicy="memory"
        recyclingKey="imuatrak-brand-logo"
        transition={0}
        accessibilityRole="image"
        accessibilityLabel="ImuaTrak"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { overflow: "hidden" },
});
