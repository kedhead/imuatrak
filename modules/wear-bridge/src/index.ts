import { NativeModules, NativeEventEmitter, Platform } from "react-native";

// Android Wear OS bridge — mirrors the iOS WatchBridge API exactly so the
// home tab can use a single listener for both platforms.

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
    const sub = emitter.addListener(event, handler);
    return { remove: () => sub.remove() };
  },
};

export type { SessionReceivedPayload };
