import { useState } from "react";
import { Platform, Text, View } from "react-native";
import { BannerAd, BannerAdSize, TestIds } from "react-native-google-mobile-ads";
import { useClub } from "@/services/clubStore";
import { useSubscription } from "@/services/subscriptionStore";

const UNIT_ID = Platform.select({
  ios: process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID_IOS ?? TestIds.ADAPTIVE_BANNER,
  android: process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID_ANDROID ?? TestIds.ADAPTIVE_BANNER,
  default: TestIds.ADAPTIVE_BANNER,
});

const IS_DEV = __DEV__;

export function AdBanner() {
  const isAdFree = useSubscription((s) => s.isAdFree);
  const clubStatus = useClub((s) => s.club?.subscriptionStatus);
  const clubAdFree = clubStatus === "active" || clubStatus === "trial";
  const [error, setError] = useState<string | null>(null);

  if (isAdFree || clubAdFree) return null;

  return (
    <View style={{ alignItems: "center" }}>
      {IS_DEV && error && (
        <Text style={{ color: "red", fontSize: 10, padding: 4 }}>
          Ad error: {error}
        </Text>
      )}
      <BannerAd
        unitId={UNIT_ID}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdFailedToLoad={(e) => setError(e.message)}
        onAdLoaded={() => setError(null)}
      />
    </View>
  );
}
