import { NativeModules, NativeEventEmitter, Platform } from "react-native";

// Android Wear OS bridge — mirrors the iOS WatchBridge API so the phone app
// can talk to a paired watch through one shape on both platforms.

const { WearBridgeModule } = NativeModules;

type SessionReceivedPayload = { id: string };
type Listener = (payload: SessionReceivedPayload) => void;

let emitter: NativeEventEmitter | null = null;
if (Platform.OS === "android" && WearBridgeModule) {
  emitter = new NativeEventEmitter(WearBridgeModule);
}

export const WearBridge = {
  addListener(event: "sessionReceived", handler: Listener) {
    if (!emitter) return { remove: () => {} };
    // RN 0.88 types native-event payloads as Object; the native side always
    // sends { id }, so narrow it here rather than loosen Listener.
    const sub = emitter.addListener(event, (payload) =>
      handler(payload as unknown as SessionReceivedPayload),
    );
    return { remove: () => sub.remove() };
  },

  /**
   * Push the units preference to the paired Wear OS watch. No-op off Android.
   *
   * Delivered as a Data Layer DataItem rather than a message: DataItems are
   * persisted and replayed when the watch next comes into range, so a change
   * made while the watch is off still lands.
   */
  setUnits(units: "metric" | "imperial") {
    if (Platform.OS !== "android" || !WearBridgeModule) return;
    WearBridgeModule.setUnits?.(units);
  },
};

export type { SessionReceivedPayload };
