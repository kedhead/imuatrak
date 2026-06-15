import { Platform } from "react-native";

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

export async function requestAuthorization(): Promise<void> {
  if (Platform.OS === "android") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("react-native-health-connect") as {
        initialize: () => Promise<boolean>;
        requestPermission: (req: { accessType: string; recordType: string }[]) => Promise<unknown>;
      };
      await mod.initialize();
      await mod.requestPermission([
        { accessType: "write", recordType: "ExerciseSession" },
        { accessType: "write", recordType: "Distance" },
        { accessType: "write", recordType: "TotalCaloriesBurned" },
      ]);
    } catch {
      // Native module not linked — skip
    }
  }
}

export async function writePaddlingWorkout(w: PaddlingWorkout): Promise<void> {
  if (Platform.OS === "android") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("react-native-health-connect") as {
        insertRecords: (records: unknown[]) => Promise<unknown>;
      };
      await mod.insertRecords([
        {
          recordType: "ExerciseSession",
          exerciseType: 60, // PADDLING
          startTime: w.startedAt.toISOString(),
          endTime: w.endedAt.toISOString(),
          title: "ImuaTrak session",
        },
      ]);
    } catch {
      // Native module not linked — skip
    }
  }
}
