import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

export interface GpsSample {
  tEpochMs: number;
  lat: number;
  lon: number;
  altM: number;
  speedMps: number;
  accuracyM: number;
}

export type GpsListener = (s: GpsSample) => void;

const TASK_NAME = "imuatrak-background-location";

const listeners = new Set<GpsListener>();

/**
 * Junk-fix rejection, mirroring what the watch already does in
 * WorkoutManager.swift.
 *
 * The OS emits wildly inaccurate fixes while it reacquires — Android's fused
 * provider especially, which falls back to cell/wifi trilateration with
 * hundreds of metres of error and happily reports it — plus cached fixes from
 * before the session started. Nothing downstream filtered any of it:
 * accuracyM was written onto the track point and then never read by anything,
 * so every junk fix contributed its full jitter to the distance. That is how
 * one paddle came back as 19 miles when it was under 7.
 *
 * Dropping a fix is safe: the clock keeps running and the track simply resumes
 * when a good one arrives.
 */
const MAX_ACCURACY_M = 100;
const MAX_SAMPLE_AGE_MS = 5000;

function isUsableFix(loc: Location.LocationObject): boolean {
  const acc = loc.coords.accuracy;
  // Null means the platform didn't report accuracy — can't judge it, so let it
  // through rather than risk recording nothing at all. A NEGATIVE value is not
  // "perfect", it means the fix is invalid.
  if (acc != null && (acc < 0 || acc > MAX_ACCURACY_M)) return false;
  // A stale cached fix at session start produces one enormous opening jump.
  if (Date.now() - loc.timestamp > MAX_SAMPLE_AGE_MS) return false;
  return true;
}

/**
 * Subscribe to GPS samples. The first subscriber starts the background
 * location task; the last unsubscribe stops it.
 */
export function subscribe(cb: GpsListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) void stopBackgroundUpdates();
  };
}

export async function requestPermissions(): Promise<boolean> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return false;
  // Background is best-effort — recording still works in foreground if user denies.
  await Location.requestBackgroundPermissionsAsync().catch(() => undefined);
  return true;
}

export async function startBackgroundUpdates(): Promise<void> {
  const already = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  if (already) return;
  await Location.startLocationUpdatesAsync(TASK_NAME, {
    accuracy: Location.Accuracy.BestForNavigation,
    activityType: Location.ActivityType.Fitness,
    timeInterval: 1000,
    distanceInterval: 0,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "ImuaTrak is recording",
      notificationBody: "Tracking your route in the background.",
      notificationColor: "#0E5FA5",
    },
  });
}

export async function stopBackgroundUpdates(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  if (started) await Location.stopLocationUpdatesAsync(TASK_NAME);
}

// Defined at module top-level so the OS can resume the task after a kill.
TaskManager.defineTask(
  TASK_NAME,
  async ({ data, error }: { data: { locations?: Location.LocationObject[] }; error: TaskManager.TaskManagerError | null }) => {
    if (error) return;
    const locations = data?.locations ?? [];
    for (const loc of locations) {
      if (!isUsableFix(loc)) continue;
      const sample: GpsSample = {
        tEpochMs: loc.timestamp,
        lat: loc.coords.latitude,
        lon: loc.coords.longitude,
        altM: loc.coords.altitude ?? 0,
        speedMps: loc.coords.speed != null && loc.coords.speed > 0 ? loc.coords.speed : 0,
        accuracyM: loc.coords.accuracy ?? 0,
      };
      for (const l of listeners) l(sample);
    }
  },
);
