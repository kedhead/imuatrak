import { httpsCallable } from "firebase/functions";
import { Platform } from "react-native";
import Purchases, { type CustomerInfo, type PurchasesPackage } from "react-native-purchases";
import { create } from "zustand";
import { auth, functions } from "./firebase";
import { useClub } from "./clubStore";

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";
const API_KEY = Platform.OS === "ios" ? IOS_KEY : ANDROID_KEY;
// Entitlement identifiers that grant ad-free. The RevenueCat dashboard's
// live entitlement is "app.imuatrak.plus.monthly" (attached to the App Store
// product); "ad_free" is kept for compatibility in case it exists or is
// adopted later. "club" is the club plan — its payer is personally ad-free
// too (their club covers everyone else). Matching ANY of them counts.
const CLUB_ENTITLEMENT = "club";
const ENTITLEMENTS = ["ad_free", "app.imuatrak.plus.monthly", CLUB_ENTITLEMENT];

// RevenueCat offering that holds the club plan package(s). Personal plans
// live in the offering marked "Current"; keeping the club plan in its own
// offering means the paywall can gate it to club owners/admins.
export const CLUB_OFFERING_ID = "club";

function hasAdFree(info: CustomerInfo): boolean {
  return ENTITLEMENTS.some((e) => e in info.entitlements.active);
}

function hasClubPlan(info: CustomerInfo): boolean {
  return CLUB_ENTITLEMENT in info.entitlements.active;
}

/**
 * After a purchase/restore that includes the club entitlement, ask the
 * backend to verify it with RevenueCat and flip the payer's club to "active",
 * then reload club state so the app reflects it immediately. Best-effort:
 * the RevenueCat webhook performs the same sync server-side regardless.
 */
async function syncClubPlanWithBackend(): Promise<void> {
  try {
    await httpsCallable(functions, "syncClubPlan")({});
  } catch {
    return; // Webhook will catch up.
  }
  const uid = auth.currentUser?.uid;
  if (uid) await useClub.getState().load(uid).catch(() => undefined);
}

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
  /** True when the payer's own "club" entitlement is active. */
  hasClubPlan: boolean;
  isLoading: boolean;
  packages: PurchasesPackage[];
  /** Packages of the CLUB_OFFERING_ID offering (club plan, admin-only UI). */
  clubPackages: PurchasesPackage[];
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
  hasClubPlan: false,
  isLoading: false,
  packages: [],
  clubPackages: [],
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
      set({ isAdFree: hasAdFree(info), hasClubPlan: hasClubPlan(info) });
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
      const clubPackages = offerings.all?.[CLUB_OFFERING_ID]?.availablePackages ?? [];
      if (packages.length > 0) {
        set({ packages, clubPackages, offeringsStatus: "ready", offeringsDiag: null });
      } else {
        // Configured and the fetch succeeded, but there's nothing to sell.
        // Almost always a RevenueCat/App Store Connect setup gap, not a bug.
        const allCount = Object.keys(offerings.all ?? {}).length;
        const diag = offerings.current
          ? "Current offering has no packages (check the product is attached & approved in App Store Connect)"
          : allCount > 0
            ? "No offering marked 'Current' in RevenueCat"
            : "No offerings configured in RevenueCat (check API key matches this project & Paid Apps Agreement is active)";
        set({ packages: [], clubPackages, offeringsStatus: "unavailable", offeringsDiag: diag });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ packages: [], clubPackages: [], offeringsStatus: "unavailable", offeringsDiag: msg });
    }
  },

  async purchase(pkg: PurchasesPackage) {
    set({ isLoading: true });
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const clubPlan = hasClubPlan(customerInfo);
      set({ isAdFree: hasAdFree(customerInfo), hasClubPlan: clubPlan, isLoading: false });
      if (clubPlan) await syncClubPlanWithBackend();
    } catch {
      set({ isLoading: false });
      throw new Error("Purchase cancelled or failed");
    }
  },

  async restore() {
    set({ isLoading: true });
    try {
      const info = await Purchases.restorePurchases();
      const clubPlan = hasClubPlan(info);
      set({ isAdFree: hasAdFree(info), hasClubPlan: clubPlan, isLoading: false });
      if (clubPlan) await syncClubPlanWithBackend();
    } catch {
      set({ isLoading: false });
    }
  },

  async refreshStatus() {
    const info = await Purchases.getCustomerInfo();
    set({ isAdFree: hasAdFree(info), hasClubPlan: hasClubPlan(info) });
  },
}));
