import { Platform } from "react-native";

export interface PaddlingWorkout {
  startedAt: Date;
  endedAt: Date;
  distanceMeters: number;
  calories: number;
  averageHeartRateBpm?: number;
}

/** Whether ImuaTrak can write workouts to Apple Health (share authorization). */
export type HealthShareStatus = "authorized" | "denied" | "notDetermined" | "unavailable";

/**
 * Read the *share* (write) authorization status for workouts. HealthKit only
 * lets apps read back share/write grants — read grants are hidden by Apple — so
 * we check the workout type we write to. iOS-only; returns "unavailable" on
 * other platforms or in Expo Go where the native module isn't linked.
 */
export function getWorkoutShareStatus(): HealthShareStatus {
  if (Platform.OS !== "ios") return "unavailable";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const HealthKit = require("@kingstinct/react-native-healthkit").default;
    if (!HealthKit?.isHealthDataAvailable?.()) return "unavailable";
    // AuthorizationStatus: notDetermined=0, sharingDenied=1, sharingAuthorized=2
    const status = HealthKit.authorizationStatusFor("HKWorkoutTypeIdentifier");
    if (status === 2) return "authorized";
    if (status === 1) return "denied";
    return "notDetermined";
  } catch {
    return "unavailable";
  }
}

export async function requestAuthorization(): Promise<void> {
  if (Platform.OS === "ios") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const HealthKit = require("@kingstinct/react-native-healthkit").default;
      await HealthKit.requestAuthorization({
        toRead: [
          "HKQuantityTypeIdentifierHeartRate",
          "HKQuantityTypeIdentifierActiveEnergyBurned",
          "HKQuantityTypeIdentifierDistanceCycling",
        ],
        toShare: [
          "HKWorkoutTypeIdentifier",
          "HKQuantityTypeIdentifierActiveEnergyBurned",
          "HKQuantityTypeIdentifierDistanceCycling",
        ],
      });
    } catch {
      // Native module not linked (Expo Go) — skip
    }
    return;
  }

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
  if (Platform.OS === "ios") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const HealthKit = require("@kingstinct/react-native-healthkit").default;
      // v14 API: numeric HKWorkoutActivityType, and each quantity sample needs
      // its own startDate/endDate (QuantitySampleForSaving).
      await HealthKit.saveWorkoutSample(
        53, // HKWorkoutActivityType.paddleSports
        [
          ...(w.distanceMeters
            ? [{ startDate: w.startedAt, endDate: w.endedAt, quantity: w.distanceMeters, unit: "m", quantityType: "HKQuantityTypeIdentifierDistanceCycling" }]
            : []),
          ...(w.calories
            ? [{ startDate: w.startedAt, endDate: w.endedAt, quantity: w.calories, unit: "kcal", quantityType: "HKQuantityTypeIdentifierActiveEnergyBurned" }]
            : []),
        ],
        w.startedAt,
        w.endedAt,
      );
    } catch {
      // Native module not linked — skip
    }
    return;
  }

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
