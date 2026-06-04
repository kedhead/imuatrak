import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { useClub } from "@/services/clubStore";
import { useSubscription } from "@/services/subscriptionStore";
import { Button } from "@/ui/Button";
import { GradientCard } from "@/ui/GradientCard";
import { GradientHeader } from "@/ui/GradientHeader";
import { ScreenBackground } from "@/ui/ScreenBackground";
import { colors, spacing, type } from "@/ui/theme";

const BENEFITS = [
  { icon: "eye-off-outline" as const, text: "No ads, ever" },
  { icon: "heart-outline" as const, text: "Support independent development" },
  { icon: "refresh-outline" as const, text: "Cancel anytime" },
];

export default function Paywall() {
  const isAdFree = useSubscription((s) => s.isAdFree);
  const isLoading = useSubscription((s) => s.isLoading);
  const packages = useSubscription((s) => s.packages);
  const purchase = useSubscription((s) => s.purchase);
  const restore = useSubscription((s) => s.restore);
  const clubStatus = useClub((s) => s.club?.subscriptionStatus);
  const clubAdFree = clubStatus === "active" || clubStatus === "trial";

  const [selectedPkg, setSelectedPkg] = useState<PurchasesPackage | null>(null);

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
          <Button
            title={isLoading ? "Processing…" : "Subscribe"}
            gradient="aqua"
            glow
            disabled={isLoading || !selectedPkg}
            onPress={onSubscribe}
            style={styles.subscribeBtn}
          />
        )}

        <Pressable onPress={onRestore} style={styles.restoreBtn}>
          <Text style={styles.restoreText}>Restore purchases</Text>
        </Pressable>

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
  restoreBtn: { alignItems: "center", paddingVertical: spacing.sm },
  restoreText: { color: colors.muted, fontSize: type.size.sm },
  legal: { fontSize: type.size.xs, color: colors.muted, textAlign: "center", lineHeight: 16 },
});
