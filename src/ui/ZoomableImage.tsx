import { useEffect, useState } from "react";
import { Image, StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/**
 * A full-screen photo you can pinch, drag and double-tap to zoom.
 *
 * Shared by every full-screen viewer in the app (club chat, DMs, the club
 * gallery, feed flyers, member profiles) so zooming behaves identically
 * everywhere rather than being reimplemented five times.
 *
 * ## Living inside a horizontal pager
 *
 * Three of the five viewers are paging FlatLists, and a pan gesture inside one
 * fights the pager for the same horizontal drag. The rule that keeps both
 * working: the pan gesture is only ENABLED while zoomed in, and the parent
 * turns off `scrollEnabled` for exactly that time (see `onZoomChange`). So at
 * 1x the pager owns horizontal drags and swiping between photos feels normal;
 * zoomed in, the drag pans the photo instead.
 *
 * That also removes the need to reset zoom when the page changes: you cannot
 * swipe away from a zoomed photo without zooming out first.
 */

const MAX_SCALE = 6;
const DOUBLE_TAP_SCALE = 2.5;
/** Anything above this counts as zoomed; a hair over 1 absorbs float drift. */
const ZOOMED_AT = 1.01;

function clamp(value: number, min: number, max: number): number {
  "worklet";
  return Math.min(Math.max(value, min), max);
}

export function ZoomableImage({
  uri,
  width,
  height,
  onPress,
  onLongPress,
  onZoomChange,
}: {
  uri: string;
  /** Size of the page this image fills — the pan limits are derived from it. */
  width: number;
  height: number;
  /** Single tap. Waits for the double-tap to fail, so zooming never closes the viewer. */
  onPress?: () => void;
  onLongPress?: () => void;
  /** Fires when the photo zooms in or back out. Parents in a pager must use
   *  this to toggle `scrollEnabled`, or panning and paging will fight. */
  onZoomChange?: (zoomed: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  // Mirrored into React state because Gesture.enabled() takes a plain boolean,
  // not a shared value. It only changes on a zoom in/out transition, so this
  // costs a render twice per gesture, not per frame.
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    onZoomChange?.(zoomed);
    // Intentionally not depending on onZoomChange: callers pass inline arrows,
    // which would re-fire this on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomed]);

  const reset = () => {
    "worklet";
    scale.value = withTiming(1);
    tx.value = withTiming(0);
    ty.value = withTiming(0);
    savedScale.value = 1;
    savedTx.value = 0;
    savedTy.value = 0;
    runOnJS(setZoomed)(false);
  };

  const pinch = Gesture.Pinch()
    // Track the focal point so the photo grows under the fingers rather than
    // from its centre.
    .onUpdate((e) => {
      const next = clamp(savedScale.value * e.scale, 0.85, MAX_SCALE);
      const maxX = (width * Math.max(0, next - 1)) / 2;
      const maxY = (height * Math.max(0, next - 1)) / 2;
      scale.value = next;
      tx.value = clamp(savedTx.value, -maxX, maxX);
      ty.value = clamp(savedTy.value, -maxY, maxY);
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        // Pinched back to (or past) fit — settle at exactly 1, centred.
        reset();
        return;
      }
      savedScale.value = scale.value;
      savedTx.value = tx.value;
      savedTy.value = ty.value;
      runOnJS(setZoomed)(true);
    });

  const pan = Gesture.Pan()
    // Only while zoomed, so an un-zoomed photo leaves horizontal drags to the
    // pager underneath.
    .enabled(zoomed)
    .averageTouches(true)
    .onUpdate((e) => {
      const maxX = (width * (scale.value - 1)) / 2;
      const maxY = (height * (scale.value - 1)) / 2;
      tx.value = clamp(savedTx.value + e.translationX, -maxX, maxX);
      ty.value = clamp(savedTy.value + e.translationY, -maxY, maxY);
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > ZOOMED_AT) {
        reset();
        return;
      }
      // Zoom toward the point that was tapped, not the middle of the screen.
      const s = DOUBLE_TAP_SCALE;
      const maxX = (width * (s - 1)) / 2;
      const maxY = (height * (s - 1)) / 2;
      const nx = clamp((width / 2 - e.x) * (s - 1), -maxX, maxX);
      const ny = clamp((height / 2 - e.y) * (s - 1), -maxY, maxY);
      scale.value = withTiming(s);
      tx.value = withTiming(nx);
      ty.value = withTiming(ny);
      savedScale.value = s;
      savedTx.value = nx;
      savedTy.value = ny;
      runOnJS(setZoomed)(true);
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    // Without this a double-tap fires the close handler on its first tap.
    .requireExternalGestureToFail(doubleTap)
    .onEnd(() => {
      if (onPress) runOnJS(onPress)();
    });

  const longPress = Gesture.LongPress()
    .minDuration(300)
    .onStart(() => {
      if (onLongPress) runOnJS(onLongPress)();
    });

  const gesture = Gesture.Simultaneous(
    pinch,
    pan,
    Gesture.Exclusive(doubleTap, longPress, singleTap),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ width, height }, styles.page, animatedStyle]}>
        <Image source={{ uri }} style={styles.image} resizeMode="contain" />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  page: { justifyContent: "center" },
  image: { width: "100%", height: "100%" },
});
