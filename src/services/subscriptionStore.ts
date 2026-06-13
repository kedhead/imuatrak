import { Platform } from "react-native";
import Purchases, { type PurchasesPackage } from "react-native-purchases";
import { create } from "zustand";

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";
const API_KEY = Platform.OS === "ios" ? IOS_KEY : ANDROID_KEY;
const ENTITLEMENT = "ad_free";

/**
 * Drives the paywall UI so it never shows a silently-disabled button:
 *  - "loading"      → offerings are being fetched
 *  - "ready"        → at least one package is available to buy
 *  - "unavailable"  → no key, no offering, or a fetch error (show Retry)
 */
export type OfferingsStatus = "idle" | "loading" | "ready" | "unavailable";

// Configure RevenueCat at most once per app session.
let configured = false;
function ensureConfigured(): boolean {
  if (!API_KEY) return false;
  if (!configured) {
    Purchases.configure({ apiKey: API_KEY });
    configured = true;
  }
  return true;
}

interface SubscriptionState {
  isAdFree: boolean;
  isLoading: boolean;
  packages: PurchasesPackage[];
  offeringsStatus: OfferingsStatus;
  /** Short reason the offerings couldn't load, shown on the paywall to aid diagnosis. */
  offeringsDiag: string | null;
  initialize: (userId: string) => Promise<void>;
  loadOfferings: () => Promise<void>;
  purchase: (pkg: PurchasesPackage) => Promise<void>;
  restore: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

export const useSubscription = create<SubscriptionState>((set, get) => ({
  isAdFree: false,
  isLoading: false,
  packages: [],
  offeringsStatus: "idle",
  offeringsDiag: null,

  async initialize(userId: string) {
    if (!ensureConfigured()) {
      // No RevenueCat key in this build — surface an explicit unavailable state
      // rather than leaving the paywall with a silently disabled button.
      set({ offeringsStatus: "unavailable", offeringsDiag: "No RevenueCat API key in this build" });
      return;
    }
    try {
      await Purchases.logIn(userId);
      const info = await Purchases.getCustomerInfo();
      set({ isAdFree: ENTITLEMENT in info.entitlements.active });
    } catch {
      // Customer-info fetch can fail offline — let offerings drive the UI.
    }
    await get().loadOfferings();
  },

  /** (Re)fetch offerings. Safe to call repeatedly — used on paywall mount and Retry. */
  async loadOfferings() {
    if (!ensureConfigured()) {
      set({ offeringsStatus: "unavailable", packages: [], offeringsDiag: "No RevenueCat API key in this build" });
      return;
    }
    set({ offeringsStatus: "loading", offeringsDiag: null });
    try {
      const offerings = await Purchases.getOfferings();
      const packages = offerings.current?.availablePackages ?? [];
      if (packages.length > 0) {
        set({ packages, offeringsStatus: "ready", offeringsDiag: null });
      } else {
        // Configured and the fetch succeeded, but there's nothing to sell.
        // Almost always a RevenueCat/App Store Connect setup gap, not a bug.
        const allCount = Object.keys(offerings.all ?? {}).length;
        const diag = offerings.current
          ? "Current offering has no packages (check the product is attached & approved in App Store Connect)"
          : allCount > 0
            ? "No offering marked 'Current' in RevenueCat"
            : "No offerings configured in RevenueCat (check API key matches this project & Paid Apps Agreement is active)";
        set({ packages: [], offeringsStatus: "unavailable", offeringsDiag: diag });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ packages: [], offeringsStatus: "unavailable", offeringsDiag: msg });
    }
  },

  async purchase(pkg: PurchasesPackage) {
    set({ isLoading: true });
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const isAdFree = ENTITLEMENT in customerInfo.entitlements.active;
      set({ isAdFree, isLoading: false });
    } catch {
      set({ isLoading: false });
      throw new Error("Purchase cancelled or failed");
    }
  },

  async restore() {
    set({ isLoading: true });
    try {
      const info = await Purchases.restorePurchases();
      const isAdFree = ENTITLEMENT in info.entitlements.active;
      set({ isAdFree, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  async refreshStatus() {
    const info = await Purchases.getCustomerInfo();
    set({ isAdFree: ENTITLEMENT in info.entitlements.active });
  },
}));
