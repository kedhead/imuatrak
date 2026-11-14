import { forwardRef, type ComponentProps, type ElementRef } from "react";
import { KeyboardAvoidingView as KCKeyboardAvoidingView } from "react-native-keyboard-controller";

type Props = ComponentProps<typeof KCKeyboardAvoidingView>;

/**
 * The app's KeyboardAvoidingView: react-native-keyboard-controller's, with
 * `automaticOffset` on by default.
 *
 * Without it the library measures the view relative to its PARENT, so on any
 * screen under a navigation header it under-shifts by the header's height.
 * iOS papered over that with a hand-tuned `keyboardVerticalOffset`; Android
 * passed 0, so on a Samsung S25 Ultra the message box sat entirely behind the
 * keyboard. `automaticOffset` reads the view's real position in the window
 * natively (present since keyboard-controller 1.22, i.e. in the 1.0.8 build),
 * which works for headers, modals and both platforms with no magic numbers.
 * `keyboardVerticalOffset` is then purely extra space — leave it unset.
 */
export const KeyboardAvoidingView = forwardRef<ElementRef<typeof KCKeyboardAvoidingView>, Props>(
  function KeyboardAvoidingView({ automaticOffset = true, ...props }, ref) {
    return <KCKeyboardAvoidingView ref={ref} automaticOffset={automaticOffset} {...props} />;
  },
);
