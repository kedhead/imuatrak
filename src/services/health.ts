export interface PaddlingWorkout {
  startedAt: Date;
  endedAt: Date;
  distanceMeters: number;
  calories: number;
  averageHeartRateBpm?: number;
}

/**
 * Workout export to the platform health store.
 *
 * iOS: ImuaTrak does not integrate with Apple HealthKit. All paddling
 * workouts are tracked and stored inside the app (history, stats, maps) and
 * synced to the user's account — independent of Apple Health. These functions
 * are no-ops on iOS.
 *
 * Android: best-effort export to Health Connect, which is an Android-only
 * integration and never links any Apple HealthKit components.
 */

// Health Connect export is DISABLED. Calling requestPermission() kills the
// whole app process: react-native-health-connect requires
// HealthConnectPermissionDelegate.setPermissionDelegate(activity) to run in
// MainActivity.onCreate, and its Expo config plugin does not install that
// hook — so the native side throws UninitializedPropertyAccessException on a
// background coroutine, which no JS try/catch can contain. Re-enabling needs:
//   1. a config plugin that patches MainActivity with the delegate call,
//   2. android.permission.health.WRITE_* entries in the manifest,
//   3. the Health Connect data-types declaration in Play Console.
// Until all three are done, these are no-ops so recording can never be taken
// down by an optional export feature.

export async function requestAuthorization(): Promise<void> {
  // Intentionally a no-op — see note above.
}

export async function writePaddlingWorkout(_w: PaddlingWorkout): Promise<void> {
  // Intentionally a no-op — see note above.
}
