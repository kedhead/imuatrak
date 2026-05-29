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
      const { default: HealthKit, HKQuantityTypeIdentifier, HKWorkoutActivityType } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("@kingstinct/react-native-healthkit") as typeof import("@kingstinct/react-native-healthkit");
      void HKWorkoutActivityType; // imported for saveWorkout usage below
      await HealthKit.requestAuthorization(
        [
          HKQuantityTypeIdentifier.activeEnergyBurned,
          HKQuantityTypeIdentifier.distanceCycling,
        ],
        [
          HKQuantityTypeIdentifier.heartRate,
          HKQuantityTypeIdentifier.activeEnergyBurned,
        ],
      );
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
      const { default: HealthKit, HKWorkoutActivityType, HKQuantityTypeIdentifier, HKUnit } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("@kingstinct/react-native-healthkit") as typeof import("@kingstinct/react-native-healthkit");
      await HealthKit.saveWorkoutSample(
        HKWorkoutActivityType.paddleSports,
        [
          ...(w.distanceMeters
            ? [{ quantity: w.distanceMeters, unit: HKUnit.Meter, quantityType: HKQuantityTypeIdentifier.distanceCycling }]
            : []),
          ...(w.calories
            ? [{ quantity: w.calories, unit: HKUnit.Kilocalorie, quantityType: HKQuantityTypeIdentifier.activeEnergyBurned }]
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
