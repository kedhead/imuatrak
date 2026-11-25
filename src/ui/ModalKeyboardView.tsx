import type { ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Keeps the inputs of a sheet inside a <Modal> above the keyboard and clear of
 * the phone's bottom bar (Android's navigation buttons, the iPhone home
 * indicator). Use it in place of KeyboardAvoidingView inside a Modal.
 *
 * Why not KeyboardAvoidingView: on Android a Modal is its own window, and
 * automaticOffset measured the view against the main window, so the padding
 * came out short and the caption/comment box sat under the keyboard (seen on
 * a Galaxy S23). And because modals now draw edge-to-edge, nothing kept a
 * bottom sheet clear of the navigation buttons even with the keyboard closed.
 *
 * Here the view fills the modal, so the bottom of the view is the bottom of
 * the screen: pad by whichever is taller, the keyboard or the bottom inset.
 * keyboard-controller reports keyboard height inside modals too (its
 * ModalAttachedWatcher), including the nav bar, as the app's provider runs
 * with navigationBarTranslucent.
 *
 * `fill` paints that padding (e.g. the sheet's white) so a bottom sheet looks
 * like it runs to the screen edge instead of floating above a strip of the
 * screen behind. Leave it out for centred dialogs and full-screen modals.
 * Full-screen modals that already pad for the bottom bar pass that amount as
 * `alreadyPadded` (it's subtracted from the keyboard height) with
 * `bottomInset={false}`. `extra` is added on top, for a sheet whose own
 * bottom padding this would otherwise replace.
 *
 * Unlike KeyboardAvoidingView it adds no flex: pass `style` with flex: 1 when
 * it wraps a full-screen layout, or the sheet's style when it is the sheet.
 */
export function ModalKeyboardView({
  style,
  children,
  fill,
  bottomInset = true,
  alreadyPadded = 0,
  extra = 0,
}: {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  fill?: string;
  bottomInset?: boolean;
  alreadyPadded?: number;
  extra?: number;
}) {
  const { height } = useReanimatedKeyboardAnimation();
  const insets = useSafeAreaInsets();
  const inset = bottomInset ? insets.bottom : 0;

  const padded = useAnimatedStyle(() => ({
    paddingBottom: Math.max(Math.abs(height.value) - alreadyPadded, inset, 0) + extra,
  }));
  const filler = useAnimatedStyle(() => ({
    height: Math.max(Math.abs(height.value) - alreadyPadded, inset, 0),
  }));

  return (
    <Animated.View style={[style, padded]}>
      {children}
      {fill ? (
        <Animated.View pointerEvents="none" style={[styles.filler, { backgroundColor: fill }, filler]} />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  filler: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
