import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Keeps a full-screen chat's composer above the keyboard.
 *
 * For screens whose bottom edge is the bottom safe-area edge (the view sits
 * inside a SafeAreaView with edges={["bottom"]}, no tab bar below it). The
 * keyboard then covers exactly (keyboard height − bottom inset) of the view,
 * so that is the padding: no measuring where the view sits on screen.
 *
 * Why not KeyboardAvoidingView with automaticOffset: it measures the view's
 * window position once, on layout. On iOS that can run while a pushed screen
 * isn't in the window yet; the native lookup fails, it falls back to the
 * parent-relative y (0 instead of below the header) and keeps that, so the
 * composer stayed behind the keyboard by the header's height until the screen
 * was reopened. Intermittent, because it depends on push-animation timing.
 */
export function ChatKeyboardView({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { height } = useReanimatedKeyboardAnimation();
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;

  const animated = useAnimatedStyle(() => ({
    paddingBottom: Math.max(0, Math.abs(height.value) - bottomInset),
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
