import { Platform } from "react-native";
import Purchases, { type PurchasesPackage } from "react-native-purchases";
import { create } from "zustand";

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";
const ENTITLEMENT = "ad_free";

interface SubscriptionState {
  isAdFree: boolean;
  isLoading: boolean;
  packages: PurchasesPackage[];
  initialize: (userId: string) => Promise<void>;
  purchase: (pkg: PurchasesPackage) => Promise<void>;
  restore: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

export const useSubscription = create<SubscriptionState>((set) => ({
  isAdFree: false,
  isLoading: false,
  packages: [],

  async initialize(userId: string) {
    const apiKey = Platform.OS === "ios" ? IOS_KEY : ANDROID_KEY;
    if (!apiKey) return;
    Purchases.configure({ apiKey });
    await Purchases.logIn(userId);
    const info = await Purchases.getCustomerInfo();
    const isAdFree = ENTITLEMENT in info.entitlements.active;
    let packages: PurchasesPackage[] = [];
    try {
      const offerings = await Purchases.getOfferings();
      packages = offerings.current?.availablePackages ?? [];
    } catch {
      // Offerings unavailable offline — still surface subscription status
    }
    set({ isAdFree, packages });
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
