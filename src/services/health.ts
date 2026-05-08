import { Platform } from "react-native";

/**
 * Thin wrapper around `react-native-health` (iOS) and
 * `react-native-health-connect` (Android). Both packages require a
 * development build — calls are no-ops in Expo Go.
 *
 * The native modules are loaded lazily via `require` so this file can be
 * imported safely in environments where they aren't linked yet.
 */
export interface PaddlingWorkout {
  startedAt: Date;
  endedAt: Date;
  distanceMeters: number;
  calories: number;
  averageHeartRateBpm?: number;
}

export async function requestAuthorization(): Promise<void> {
  if (Platform.OS === "ios") {
    const mod = tryRequire<{
      default: {
        initHealthKit: (
          opts: { permissions: { read: string[]; write: string[] } },
          cb: (err: string | null) => void,
        ) => void;
        Constants: { Permissions: Record<string, string> };
      };
    }>("react-native-health");
    if (!mod) return;
    const HK = mod.default;
    const P = HK.Constants.Permissions;
    await new Promise<void>((resolve, reject) => {
      HK.initHealthKit(
        {
          permissions: {
            read: [P.HeartRate!, P.ActiveEnergyBurned!, P.DistanceSwimming!],
            write: [P.Workout!, P.ActiveEnergyBurned!, P.DistanceSwimming!],
          },
        },
        (err) => (err ? reject(new Error(err)) : resolve()),
      );
    });
    return;
  }

  if (Platform.OS === "android") {
    const mod = tryRequire<{
      initialize: () => Promise<boolean>;
      requestPermission: (req: { accessType: string; recordType: string }[]) => Promise<unknown>;
    }>("react-native-health-connect");
    if (!mod) return;
    await mod.initialize();
    await mod.requestPermission([
      { accessType: "write", recordType: "ExerciseSession" },
      { accessType: "write", recordType: "Distance" },
      { accessType: "write", recordType: "TotalCaloriesBurned" },
    ]);
  }
}

export async function writePaddlingWorkout(w: PaddlingWorkout): Promise<void> {
  if (Platform.OS === "ios") {
    const mod = tryRequire<{
      default: {
        saveWorkout: (
          opts: {
            type: string;
            startDate: string;
            endDate: string;
            energyBurned?: number;
            distance?: number;
          },
          cb: (err: string | null) => void,
        ) => void;
      };
    }>("react-native-health");
    if (!mod) return;
    const HK = mod.default;
    await new Promise<void>((resolve, reject) => {
      HK.saveWorkout(
        {
          // HKWorkoutActivityType.paddleSports = 53
          type: "PaddleSports",
          startDate: w.startedAt.toISOString(),
          endDate: w.endedAt.toISOString(),
          energyBurned: w.calories || undefined,
          distance: w.distanceMeters || undefined,
        },
        (err) => (err ? reject(new Error(err)) : resolve()),
      );
    });
    return;
  }

  if (Platform.OS === "android") {
    const mod = tryRequire<{
      insertRecords: (records: unknown[]) => Promise<unknown>;
    }>("react-native-health-connect");
    if (!mod) return;
    await mod.insertRecords([
      {
        recordType: "ExerciseSession",
        exerciseType: 60, // PADDLING
        startTime: w.startedAt.toISOString(),
        endTime: w.endedAt.toISOString(),
        title: "ImuaTrak session",
      },
    ]);
  }
}

function tryRequire<T>(name: string): T | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(name) as T;
  } catch {
    return null;
  }
}
