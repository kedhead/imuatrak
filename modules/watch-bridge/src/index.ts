import { NativeModules, NativeEventEmitter, Platform } from "react-native";

// JS API for the iOS WatchConnectivity bridge.
// On Android this module is a no-op.

const { WatchBridgeModule } = NativeModules;

type SessionReceivedPayload = { id: string };
type Listener = (payload: SessionReceivedPayload) => void;

let emitter: NativeEventEmitter | null = null;

if (Platform.OS === "ios" && WatchBridgeModule) {
  emitter = new NativeEventEmitter(WatchBridgeModule);
}

export const WatchBridge = {
  /** Subscribe to watch session arrivals. Returns an object with a remove() method. */
  addListener(event: "sessionReceived", handler: Listener) {
    if (!emitter) return { remove: () => {} };
    const sub = emitter.addListener(event, handler);
    return { remove: () => sub.remove() };
  },

  /** Push the units preference to the paired watch. No-op off iOS. */
  setUnits(units: "metric" | "imperial") {
    if (Platform.OS !== "ios" || !WatchBridgeModule) return;
    WatchBridgeModule.setUnits?.(units);
  },
};

export type { SessionReceivedPayload };
