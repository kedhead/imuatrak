import { httpsCallable } from "firebase/functions";
import { WatchBridge } from "@imuatrak/watch-bridge";
import { auth, functions } from "./firebase";

/**
 * Phone → Apple Watch handoff over WatchConnectivity.
 *
 * Two payloads flow to the watch:
 *  - `auth`: a freshly-minted Firebase custom token so the watch can sign in
 *    independently (issueWatchToken Cloud Function). Once the watch calls
 *    signIn(withCustomToken:), FirebaseAuth on the watch manages its own
 *    refresh token and syncs directly to Firestore — no phone required after.
 *  - `settings`: the user's weekly goals + unit/craft prefs so the watch's
 *    goal glance has live values.
 *
 * All calls are best-effort no-ops off iOS or when no watch is paired.
 */

/** Mint a watch custom token for the current user and push it to the watch. */
export async function pushAuthToWatch(): Promise<void> {
  if (!auth.currentUser) return;
  try {
    const fn = httpsCallable<Record<string, never>, { customToken: string }>(
      functions,
      "issueWatchToken",
    );
    const { data } = await fn({});
    await WatchBridge.sendContext({ type: "auth", customToken: data.customToken });
  } catch {
    // Watch may be absent / unreachable — the watch can request a token later.
  }
}

/** Push the user's weekly goals + prefs to the watch. */
export async function pushSettingsToWatch(s: {
  weeklyGoalDistanceKm: number;
  weeklyGoalDurationMin: number;
  units: string;
  defaultCraft: string;
}): Promise<void> {
  try {
    await WatchBridge.sendContext({ type: "settings", ...s });
  } catch {
    // best-effort
  }
}
