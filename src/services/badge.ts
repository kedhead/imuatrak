import * as Notifications from "expo-notifications";
import { getUnreadTotal } from "./clubService";

/**
 * Keep the iOS app-icon badge in sync with the user's unread total. The push
 * notification sets the badge when a message arrives; this keeps it correct
 * when the app is opened or a channel is read (Android ignores it and shows
 * its own notification dots).
 */
export async function setAppBadge(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {
    // Best-effort — never let a badge update crash a flow.
  }
}

export async function syncAppBadge(uid: string): Promise<void> {
  try {
    await setAppBadge(await getUnreadTotal(uid));
  } catch {
    // Best-effort.
  }
}
