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

  /** Returns true if WatchConnectivity is available and a watch is paired. */
  isSupported(): boolean {
    if (Platform.OS !== "ios" || !WatchBridgeModule) return false;
    return WatchBridgeModule.isSupported?.() ?? false;
  },
};

export type { SessionReceivedPayload };
