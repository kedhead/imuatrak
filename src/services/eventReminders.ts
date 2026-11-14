import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Alert, Platform } from "react-native";
import type { ClubEvent } from "@/models/club";

/**
 * Local practice reminders. When a paddler RSVPs "going" to an event, two
 * local notifications are scheduled — 24 hours and 1 hour before the start
 * (skipping any lead time already in the past). Backing out cancels them, and
 * re-syncing against a loaded event reschedules when an admin moved the time.
 *
 * Everything is on-device (expo-notifications scheduled triggers), so no
 * server involvement; the trade-off is that a time change made while this
 * user never reopens the event keeps the old reminder. Acceptable for v1.
 */

const KEY = "imuatrak.eventReminders";
/** Set once we've asked an Android user for exact alarms, so we ask once. */
const EXACT_ASKED_KEY = "imuatrak.exactAlarmAsked";
const ANDROID_CHANNEL = "event-reminders";

interface StoredReminder {
  notificationIds: string[];
  startAt: string;
}
type ReminderMap = Record<string, StoredReminder>; // key = clubId:eventId

// The body names the day and clock time, never "in 1 hour": Android may
// deliver a local notification late (see ensureExactAlarms), and "Today at
// 9:00 AM" stays true where "Starts in 1 hour" arriving at 9:58 does not.
const LEADS: { ms: number; day: "Tomorrow" | "Today" }[] = [
  { ms: 24 * 60 * 60 * 1000, day: "Tomorrow" },
  { ms: 60 * 60 * 1000, day: "Today" },
];

/**
 * Android only. Without the exact-alarm permission, Android schedules our
 * reminders as inexact alarms that battery saving (Doze, and OEM policies on
 * Samsung and others) can push back by an hour or more — a "starts in 1 hour"
 * reminder arrived after practice began. Android 14+ denies the permission by
 * default, so the first time someone RSVPs "going" we explain and open the
 * system "Alarms & reminders" switch once.
 *
 * Builds whose manifest doesn't declare SCHEDULE_EXACT_ALARM (1.0.9 and
 * earlier) report canAskAgain=false, so this is a no-op there and safe to OTA.
 */
async function ensureExactAlarms(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const current = await Notifications.getExactAlarmPermissionsAsync();
    if (current.granted || !current.canAskAgain) return;
    if ((await AsyncStorage.getItem(EXACT_ASKED_KEY)) === "1") return;
    await AsyncStorage.setItem(EXACT_ASKED_KEY, "1");
    await new Promise<void>((resolve) =>
      Alert.alert(
        "On-time practice reminders",
        "To remind you an hour before practice right on time, ImuaTrak needs Android's \"Alarms & reminders\" permission. Without it, your phone may deliver reminders late to save battery.",
        [
          { text: "Not now", style: "cancel", onPress: () => resolve() },
          {
            text: "Allow",
            onPress: () => {
              void Notifications.requestExactAlarmPermissionsAsync()
                .catch(() => undefined)
                .finally(() => resolve());
            },
          },
        ],
        { cancelable: true, onDismiss: () => resolve() },
      ),
    );
  } catch {
    // Never let the permission dance block an RSVP.
  }
}

async function readMap(): Promise<ReminderMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ReminderMap) : {};
  } catch {
    return {};
  }
}

async function writeMap(map: ReminderMap): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Losing the index means a stray reminder at worst — never block the UI.
  }
}

async function ensureReady(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return false;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: "Practice reminders",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
    }).catch(() => undefined);
  }
  return true;
}

async function cancelStored(map: ReminderMap, key: string): Promise<void> {
  const stored = map[key];
  if (!stored) return;
  await Promise.all(
    stored.notificationIds.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined),
    ),
  );
  delete map[key];
}

/**
 * Bring this event's local reminders in line with the user's RSVP: schedule
 * when going (or reschedule if the start time moved), cancel otherwise.
 */
export async function syncEventReminders(
  event: Pick<ClubEvent, "id" | "clubId" | "title" | "startAt" | "location">,
  going: boolean,
): Promise<void> {
  const key = `${event.clubId}:${event.id}`;
  const map = await readMap();
  const stored = map[key];

  if (!going) {
    if (stored) {
      await cancelStored(map, key);
      await writeMap(map);
    }
    return;
  }

  if (stored && stored.startAt === event.startAt) return; // Already in sync.
  if (!(await ensureReady())) return;
  await ensureExactAlarms();
  if (stored) await cancelStored(map, key); // Time changed — reschedule.

  const start = new Date(event.startAt);
  const timeStr = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const where = event.location?.name ? ` at ${event.location.name}` : "";
  const notificationIds: string[] = [];

  for (const lead of LEADS) {
    const fireAt = new Date(start.getTime() - lead.ms);
    if (fireAt.getTime() <= Date.now()) continue;
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: event.title,
          body: `${lead.day} at ${timeStr}${where}. See you on the water!`,
          sound: "default",
          // startAt lets the foreground handler drop a reminder that arrives
          // after the event already began.
          data: { clubId: event.clubId, eventId: event.id, startAt: event.startAt, kind: "eventReminder" },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireAt,
          ...(Platform.OS === "android" ? { channelId: ANDROID_CHANNEL } : {}),
        },
      });
      notificationIds.push(id);
    } catch {
      // Scheduling is best-effort; RSVP itself must never fail because of it.
    }
  }

  if (notificationIds.length > 0) {
    map[key] = { notificationIds, startAt: event.startAt };
  }
  await writeMap(map);
}

/** Drop reminders for events that already started — housekeeping on launch. */
export async function pruneEventReminders(): Promise<void> {
  const map = await readMap();
  const now = new Date().toISOString();
  let changed = false;
  for (const [key, stored] of Object.entries(map)) {
    if (stored.startAt <= now) {
      delete map[key];
      changed = true;
    }
  }
  if (changed) await writeMap(map);
}
