import { useEffect, useMemo } from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import {
  NativeAdChoicesPlacement,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaAspectRatio,
  NativeMediaView,
  TestIds,
  useNativeAd,
} from "react-native-google-mobile-ads";
import { clubGrantsAdFree } from "@/models/club";
import { useAds } from "@/services/ads";
import { useClub } from "@/services/clubStore";
import { useSubscription } from "@/services/subscriptionStore";
import { Badge } from "./Badge";
import { GradientCard } from "./GradientCard";
import { colors, radii, spacing, type } from "./theme";

export const NATIVE_UNIT_ID = Platform.select({
  ios: process.env.EXPO_PUBLIC_ADMOB_NATIVE_UNIT_ID_IOS ?? TestIds.NATIVE,
  android: process.env.EXPO_PUBLIC_ADMOB_NATIVE_UNIT_ID_ANDROID ?? TestIds.NATIVE,
  default: TestIds.NATIVE,
});

/**
 * A native ad styled as a card in the Sessions list.
 *
 * AdMob policy for native ads, which this layout follows: the ad is labelled
 * "Ad", the SDK's AdChoices icon stays visible (placed top-right), the main
 * image or video goes through NativeMediaView at 120×120 or larger, and the
 * advertiser's headline, body and button text are shown as delivered.
 *
 * Renders nothing for ad-free users, and until an ad has loaded, so an empty
 * or failed request never leaves a blank card in the list.
 */
export function NativeAdCard() {
  const isAdFree = useSubscription((s) => s.isAdFree);
  const club = useClub((s) => s.club);
  const adFree = isAdFree || clubGrantsAdFree(club);
  const personalizedAds = useAds((s) => s.personalizedAds);
  const attRequested = useAds((s) => s.attRequested);
  const recordNativeAdResult = useAds((s) => s.recordNativeAdResult);

  // A new object identity reloads the ad, so build it only when an input changes.
  const requestOptions = useMemo(
    () => ({
      requestNonPersonalizedAdsOnly: !personalizedAds,
      aspectRatio: NativeMediaAspectRatio.LANDSCAPE,
      adChoicesPlacement: NativeAdChoicesPlacement.TOP_RIGHT,
      startVideoMuted: true,
    }),
    [personalizedAds],
  );

  // Wait for the ATT answer so the first request already knows whether it may
  // be personalized; Apple requires the prompt before any ad request.
  const ad = useNativeAd({
    adUnitId: adFree ? null : (NATIVE_UNIT_ID ?? null),
    requestOptions,
    autoLoad: attRequested,
  });

  useEffect(() => {
    if (ad.status === "loaded") recordNativeAdResult("loaded");
    else if (ad.status === "no-fill" || ad.status === "error") {
      recordNativeAdResult(`${ad.status}: ${ad.error.code} — ${ad.error.message}`);
    }
  }, [ad.status, ad.error, recordNativeAdResult]);

  if (ad.status !== "loaded") return null;
  const nativeAd = ad.nativeAd;

  return (
    <NativeAdView nativeAd={nativeAd}>
      <GradientCard>
        <View style={styles.top}>
          {nativeAd.icon && (
            <NativeAsset assetType={NativeAssetType.ICON}>
              <Image source={{ uri: nativeAd.icon.url }} style={styles.icon} />
            </NativeAsset>
          )}
          <View style={styles.titles}>
            <NativeAsset assetType={NativeAssetType.HEADLINE}>
              <Text style={styles.headline} numberOfLines={2}>
                {nativeAd.headline}
              </Text>
            </NativeAsset>
            {nativeAd.advertiser && (
              <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                <Text style={styles.advertiser} numberOfLines={1}>
                  {nativeAd.advertiser}
                </Text>
              </NativeAsset>
            )}
          </View>
          {/* Sits left of the AdChoices icon the SDK draws in the top-right corner. */}
          <Badge label="Ad" color={colors.gold} style={styles.adBadge} />
        </View>

        <NativeMediaView style={styles.media} resizeMode="cover" />

        <NativeAsset assetType={NativeAssetType.BODY}>
          <Text style={styles.body} numberOfLines={3}>
            {nativeAd.body}
          </Text>
        </NativeAsset>

        {nativeAd.callToAction ? (
          <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
            <Text style={styles.cta}>{nativeAd.callToAction}</Text>
          </NativeAsset>
        ) : null}
      </GradientCard>
    </NativeAdView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingRight: 24 },
  icon: { width: 40, height: 40, borderRadius: radii.sm },
  titles: { flex: 1, gap: 2 },
  headline: { fontSize: type.size.md, fontWeight: type.weight.bold, color: colors.ink },
  advertiser: { fontSize: type.size.xs, color: colors.muted },
  adBadge: { alignSelf: "flex-start" },
  // Full card width at 16:9 is well over AdMob's 120×120 minimum on any phone.
  media: { width: "100%", aspectRatio: 16 / 9, marginTop: spacing.sm, borderRadius: radii.sm, overflow: "hidden" },
  body: { fontSize: type.size.sm, color: colors.inkSoft, marginTop: spacing.sm, lineHeight: 18 },
  cta: {
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    backgroundColor: colors.ocean,
    color: colors.white,
    fontSize: type.size.sm,
    fontWeight: type.weight.bold,
    overflow: "hidden",
  },
});
