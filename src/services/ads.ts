import { Platform } from "react-native";
import { create } from "zustand";

/**
 * App Tracking Transparency (ATT) state for ad personalization.
 *
 * AdMob (react-native-google-mobile-ads) links Apple's AppTrackingTransparency
 * framework, so App Review requires the app to actually present the ATT prompt
 * before any tracking-related data is collected (i.e. before the first ad
 * request). We request once, then serve personalized ads only if the user
 * granted permission — otherwise non-personalized ads, which need no consent.
 *
 * Android has no ATT; ads default to non-personalized here (Google's UMP
 * consent flow can be layered on later if EEA targeting is added).
 */
interface AdsState {
  /** True only after the user explicitly granted ATT permission (iOS). */
  personalizedAds: boolean;
  /** True once the ATT prompt has been requested this install. */
  attRequested: boolean;
  /** Show the ATT prompt if still undetermined, then record the outcome. */
  requestTracking: () => Promise<void>;
}

export const useAds = create<AdsState>((set, get) => ({
  personalizedAds: false,
  attRequested: false,

  async requestTracking() {
    if (get().attRequested) return;
    if (Platform.OS !== "ios") {
      set({ personalizedAds: false, attRequested: true });
      return;
    }
    try {
      // Dynamically required so the app still runs in environments where the
      // native module isn't linked (e.g. Expo Go); falls through to
      // non-personalized ads if unavailable.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const att = require("expo-tracking-transparency") as {
        getTrackingPermissionsAsync: () => Promise<{ status: string; canAskAgain: boolean }>;
        requestTrackingPermissionsAsync: () => Promise<{ status: string }>;
      };
      let { status, canAskAgain } = await att.getTrackingPermissionsAsync();
      if (status === "undetermined" && canAskAgain) {
        ({ status } = await att.requestTrackingPermissionsAsync());
      }
      set({ personalizedAds: status === "granted", attRequested: true });
    } catch {
      // Module unavailable — stay on non-personalized ads (no consent needed).
      set({ personalizedAds: false, attRequested: true });
    }
  },
}));
