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

  /**
   * Send a JSON-serialisable payload to the paired watch (e.g. a Firebase
   * custom token for the watch to sign in with, or the user's weekly goals).
   * The latest value is retained in WatchConnectivity's applicationContext, so
   * a watch that wakes later still receives it. No-op off iOS / without a watch.
   */
  async sendContext(payload: WatchContextPayload): Promise<boolean> {
    if (Platform.OS !== "ios" || !WatchBridgeModule?.sendContext) return false;
    try {
      return await WatchBridgeModule.sendContext(payload);
    } catch {
      return false;
    }
  },
};

export type WatchContextPayload =
  | { type: "auth"; customToken: string }
  | {
      type: "settings";
      weeklyGoalDistanceKm: number;
      weeklyGoalDurationMin: number;
      units: string;
      defaultCraft: string;
    };

export type { SessionReceivedPayload };
