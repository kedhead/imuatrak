import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { Alert } from "react-native";
import { clubGrantsAdFree } from "@/models/club";
import { upgradePromptDue } from "@/models/upgradePrompt";
import { useClub } from "./clubStore";
import { listSummaries } from "./storage";
import { useSubscription } from "./subscriptionStore";

/**
 * A once-in-a-while invitation to ImuaTrak+, shown right after a paddler saves
 * a session: the moment they've just got value from the app. Never on launch,
 * never to someone already ad-free, and at most once per PROMPT_INTERVAL_DAYS
 * (see upgradePromptDue in src/models/upgradePrompt.ts).
 */
const KEY = "imuatrak.upgradePromptShownAt";

/** Show the prompt if it's due. Best-effort: any failure just skips it. */
export async function maybeShowUpgradePrompt(): Promise<void> {
  try {
    if (useSubscription.getState().isAdFree) return;
    if (clubGrantsAdFree(useClub.getState().club)) return;

    const raw = await AsyncStorage.getItem(KEY);
    const lastShownMs = raw ? Number(raw) : null;
    const sessionCount = (await listSummaries()).length;
    const now = Date.now();
    if (!upgradePromptDue(sessionCount, Number.isFinite(lastShownMs) ? lastShownMs : null, now)) {
      return;
    }

    // Record first, so a crash or a second save can't show it twice.
    await AsyncStorage.setItem(KEY, String(now));
    Alert.alert(
      "Enjoying ImuaTrak?",
      `That's ${sessionCount} paddles logged. Go ad-free and message your crew with ImuaTrak+.`,
      [
        { text: "Maybe later", style: "cancel" },
        { text: "See plans", onPress: () => router.push("/paywall") },
      ],
    );
  } catch {
    // Never let a nudge get in the way of saving a session.
  }
}
