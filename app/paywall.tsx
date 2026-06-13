import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { useClub } from "@/services/clubStore";
import { useSubscription } from "@/services/subscriptionStore";
import { Button } from "@/ui/Button";
import { GradientCard } from "@/ui/GradientCard";
import { GradientHeader } from "@/ui/GradientHeader";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, spacing, type } from "@/ui/theme";

// Apple accepts its standard Licensed Application EULA as the Terms of Use when
// an app has no custom EULA. Privacy Policy is hosted on the marketing site.
const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
const PRIVACY_URL = "https://imuatrak.app/privacy";

const BENEFITS = [
  { icon: "eye-off-outline" as const, text: "No ads, ever" },
  { icon: "heart-outline" as const, text: "Support independent development" },
  { icon: "refresh-outline" as const, text: "Cancel anytime" },
];

const FEATURES = [
  { icon: "water-outline" as const, text: "GPS session tracking with pace, stroke rate & distance" },
  { icon: "chatbubbles-outline" as const, text: "Club channels & team chat" },
  { icon: "calendar-outline" as const, text: "Club events, lineups & RSVP" },
  { icon: "people-outline" as const, text: "Club feed, polls & announcements" },
  { icon: "heart-circle-outline" as const, text: "Apple Health workout sync" },
];

export default function Paywall() {
  const isAdFree = useSubscription((s) => s.isAdFree);
  const isLoading = useSubscription((s) => s.isLoading);
  const packages = useSubscription((s) => s.packages);
  const offeringsStatus = useSubscription((s) => s.offeringsStatus);
  const offeringsDiag = useSubscription((s) => s.offeringsDiag);
  const loadOfferings = useSubscription((s) => s.loadOfferings);
  const purchase = useSubscription((s) => s.purchase);
  const restore = useSubscription((s) => s.restore);
  const clubStatus = useClub((s) => s.club?.subscriptionStatus);
  const clubAdFree = clubStatus === "active" || clubStatus === "trial";

  const [selectedPkg, setSelectedPkg] = useState<PurchasesPackage | null>(null);

  // Refresh offerings whenever the paywall opens so the user never lands on a
  // stale/empty state from an earlier failed fetch.
  useEffect(() => {
    void loadOfferings();
  }, [loadOfferings]);

  useEffect(() => {
    if (packages.length > 0 && !selectedPkg) {
      // Default to the first available package (usually monthly)
      setSelectedPkg(packages[0] ?? null);
    }
  }, [packages, selectedPkg]);

  const onSubscribe = async () => {
    if (!selectedPkg) return;
    try {
      await purchase(selectedPkg);
      Alert.alert("Welcome to ImuaTrak+", "Ads removed. Thank you for your support!", [
        { text: "Great!", onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert("Purchase failed", "Please try again or restore a previous purchase.");
    }
  };

  const onRestore = async () => {
    await restore();
    if (useSubscription.getState().isAdFree) {
      Alert.alert("Restored", "Your ImuaTrak+ subscription is active.", [
        { text: "Done", onPress: () => router.back() },
      ]);
    } else {
      Alert.alert("Nothing to restore", "No active ImuaTrak+ subscription found for this account.");
    }
  };

  return (
    <ScreenBackground>
      <GradientHeader
        title="ImuaTrak+"
        subtitle="Paddle without interruption"
      />
      <ScrollView contentContainerStyle={styles.scroll}>

        {(isAdFree || clubAdFree) && (
          <GradientCard gradient="ocean" style={styles.activeCard}>
            <View style={styles.activeRow}>
              <Ionicons name="checkmark-circle" size={20} color={colors.white} />
              <Text style={styles.activeText}>
                {isAdFree ? "Your ImuaTrak+ subscription is active" : "You're ad-free via your club membership"}
              </Text>
            </View>
          </GradientCard>
        )}

        <GradientCard style={styles.benefitsCard}>
          {BENEFITS.map((b) => (
            <View key={b.text} style={styles.benefitRow}>
              <Ionicons name={b.icon} size={20} color={colors.ocean} />
              <Text style={styles.benefitText}>{b.text}</Text>
            </View>
          ))}
        </GradientCard>

        <View>
          <Text style={styles.featuresHeading}>Everything in ImuaTrak</Text>
          <GradientCard style={styles.benefitsCard}>
            {FEATURES.map((f) => (
              <View key={f.text} style={styles.benefitRow}>
                <Ionicons name={f.icon} size={20} color={colors.seafoam} />
                <Text style={styles.benefitText}>{f.text}</Text>
              </View>
            ))}
          </GradientCard>
        </View>

        {packages.length > 0 && (
          <View style={styles.packages}>
            {packages.map((pkg) => {
              const selected = selectedPkg?.identifier === pkg.identifier;
              return (
                <Pressable
                  key={pkg.identifier}
                  onPress={() => setSelectedPkg(pkg)}
                  style={[styles.pkgCard, selected && styles.pkgCardSelected]}
                >
                  <Text style={[styles.pkgTitle, selected && styles.pkgTitleSelected]}>
                    {pkg.product.title || pkg.packageType}
                  </Text>
                  <Text style={[styles.pkgPrice, selected && styles.pkgPriceSelected]}>
                    {pkg.product.priceString}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {!isAdFree && !clubAdFree && (
          packages.length > 0 ? (
            // Offerings loaded — show an enabled Subscribe button.
            <Button
              title={isLoading ? "Processing…" : "Subscribe"}
              gradient="aqua"
              glow
              disabled={isLoading || !selectedPkg}
              onPress={onSubscribe}
              style={styles.subscribeBtn}
            />
          ) : offeringsStatus === "loading" || offeringsStatus === "idle" ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.ocean} />
              <Text style={styles.loadingText}>Loading plans…</Text>
            </View>
          ) : (
            // No packages available — never present a dead Subscribe button.
            <GradientCard style={styles.unavailableCard}>
              <Text style={styles.unavailableText}>
                Subscriptions are temporarily unavailable. Please check your connection and try again.
              </Text>
              {offeringsDiag && (
                <Text style={styles.diagText}>{offeringsDiag}</Text>
              )}
              <Button
                title="Retry"
                gradient="aqua"
                onPress={() => void loadOfferings()}
                style={{ marginTop: spacing.sm }}
              />
            </GradientCard>
          )
        )}

        <Pressable onPress={onRestore} style={styles.restoreBtn}>
          <Text style={styles.restoreText}>Restore purchases</Text>
        </Pressable>

        <View style={styles.legalLinks}>
          <Pressable onPress={() => void Linking.openURL(TERMS_URL)}>
            <Text style={styles.legalLink}>Terms of Use (EULA)</Text>
          </Pressable>
          <Text style={styles.legalDot}>•</Text>
          <Pressable onPress={() => void Linking.openURL(PRIVACY_URL)}>
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </Pressable>
        </View>

        <Text style={styles.legal}>
          Subscriptions auto-renew until cancelled. Manage or cancel in your device's subscription settings.
        </Text>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  activeCard: { marginBottom: spacing.xs },
  activeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  activeText: { color: colors.white, fontWeight: type.weight.bold, fontSize: type.size.md, flex: 1 },
  featuresHeading: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.muted, letterSpacing: 0.5, marginBottom: spacing.sm },
  benefitsCard: { gap: spacing.md },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  benefitText: { color: colors.ink, fontSize: type.size.md, flex: 1 },
  packages: { flexDirection: "row", gap: spacing.sm },
  pkgCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    padding: spacing.md,
    alignItems: "center",
    backgroundColor: colors.bgSoft,
  },
  pkgCardSelected: { borderColor: colors.ocean, backgroundColor: "rgba(7,49,79,0.06)" },
  pkgTitle: { fontSize: type.size.sm, fontWeight: type.weight.bold, color: colors.muted, textAlign: "center" },
  pkgTitleSelected: { color: colors.ocean },
  pkgPrice: { fontSize: type.size.xl, fontWeight: type.weight.heavy, color: colors.ink, marginTop: spacing.xs },
  pkgPriceSelected: { color: colors.ocean },
  subscribeBtn: { marginTop: spacing.xs },
  loadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.md },
  loadingText: { color: colors.muted, fontSize: type.size.md },
  unavailableCard: { gap: spacing.xs },
  unavailableText: { color: colors.ink, fontSize: type.size.sm, textAlign: "center", lineHeight: 18 },
  diagText: { color: colors.muted, fontSize: type.size.xs, textAlign: "center", lineHeight: 15, marginTop: spacing.xs },
  restoreBtn: { alignItems: "center", paddingVertical: spacing.sm },
  restoreText: { color: colors.muted, fontSize: type.size.sm },
  legalLinks: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: spacing.sm },
  legalLink: { color: colors.ocean, fontSize: type.size.xs, fontWeight: type.weight.bold },
  legalDot: { color: colors.muted, fontSize: type.size.xs },
  legal: { fontSize: type.size.xs, color: colors.muted, textAlign: "center", lineHeight: 16 },
});
