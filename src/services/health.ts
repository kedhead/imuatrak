import { Platform } from "react-native";

export interface PaddlingWorkout {
  startedAt: Date;
  endedAt: Date;
  distanceMeters: number;
  calories: number;
  averageHeartRateBpm?: number;
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
      await HealthKit.saveWorkoutSample(
        // HKWorkoutActivityType.paddleSports = 53
        "paddleSports",
        [
          ...(w.distanceMeters
            ? [{ quantity: w.distanceMeters, unit: "m", quantityType: "HKQuantityTypeIdentifierDistanceCycling" }]
            : []),
          ...(w.calories
            ? [{ quantity: w.calories, unit: "kcal", quantityType: "HKQuantityTypeIdentifierActiveEnergyBurned" }]
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
