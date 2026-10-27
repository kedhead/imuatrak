import { useState } from "react";
import { Platform, Text, View } from "react-native";
import { BannerAd, BannerAdSize, TestIds } from "react-native-google-mobile-ads";
import { clubGrantsAdFree } from "@/models/club";
import { useAds } from "@/services/ads";
import { useClub } from "@/services/clubStore";
import { useSubscription } from "@/services/subscriptionStore";

export const UNIT_ID = Platform.select({
  ios: process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID_IOS ?? TestIds.ADAPTIVE_BANNER,
  android: process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID_ANDROID ?? TestIds.ADAPTIVE_BANNER,
  default: TestIds.ADAPTIVE_BANNER,
});

const IS_DEV = __DEV__;

// The tab bar floats over the bottom of every tab screen (styles.bar in
// app/(tabs)/_layout.tsx: 68pt tall, 24pt up on iOS, 16pt on Android). The
// banner sits at the bottom of Home and Stats, so without this clearance a
// loaded ad renders entirely behind the tab bar and is never seen.
const TAB_BAR_CLEARANCE = (Platform.OS === "ios" ? 24 : 16) + 68 + 8;

/**
 * `aboveTabBar` (default true) lifts the banner clear of the floating tab bar,
 * for the bottom of a tab screen. Pass false where there's no tab bar, e.g.
 * at the top of a chat.
 */
export function AdBanner({ aboveTabBar = true }: { aboveTabBar?: boolean } = {}) {
  const isAdFree = useSubscription((s) => s.isAdFree);
  const club = useClub((s) => s.club);
  const clubAdFree = clubGrantsAdFree(club);
  const personalizedAds = useAds((s) => s.personalizedAds);
  const recordAdResult = useAds((s) => s.recordAdResult);
  const [error, setError] = useState<string | null>(null);

  if (isAdFree || clubAdFree) return null;

  return (
    <View style={{ alignItems: "center", marginBottom: aboveTabBar ? TAB_BAR_CLEARANCE : 0 }}>
      {IS_DEV && error && (
        <Text style={{ color: "red", fontSize: 10, padding: 4 }}>
          Ad error: {error}
        </Text>
      )}
      <BannerAd
        unitId={UNIT_ID}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: !personalizedAds }}
        onAdFailedToLoad={(e) => {
          setError(e.message);
          const code = (e as Error & { code?: string }).code;
          recordAdResult(`failed: ${code ? `${code} — ` : ""}${e.message}`);
        }}
        onAdLoaded={() => {
          setError(null);
          recordAdResult("loaded");
        }}
      />
    </View>
  );
}
