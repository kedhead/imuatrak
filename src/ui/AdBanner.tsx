import { Platform, View } from "react-native";
import { BannerAd, BannerAdSize, TestIds } from "react-native-google-mobile-ads";
import { useClub } from "@/services/clubStore";
import { useSubscription } from "@/services/subscriptionStore";

const UNIT_ID = Platform.select({
  ios: process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID_IOS ?? TestIds.ADAPTIVE_BANNER,
  android: process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID_ANDROID ?? TestIds.ADAPTIVE_BANNER,
  default: TestIds.ADAPTIVE_BANNER,
});

export function AdBanner() {
  const isAdFree = useSubscription((s) => s.isAdFree);
  const clubStatus = useClub((s) => s.club?.subscriptionStatus);
  const clubAdFree = clubStatus === "active" || clubStatus === "trial";

  if (isAdFree || clubAdFree) return null;

  return (
    <View style={{ alignItems: "center" }}>
      <BannerAd unitId={UNIT_ID} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
    </View>
  );
}
