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

const TASK_NAME = "paddleup-background-location";

const listeners = new Set<GpsListener>();

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
      notificationTitle: "Paddleup is recording",
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
  ({ data, error }: { data: { locations?: Location.LocationObject[] }; error: TaskManager.TaskManagerError | null }) => {
    if (error) return;
    const locations = data?.locations ?? [];
    for (const loc of locations) {
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
