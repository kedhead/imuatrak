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
      const mod = require("react-native-health") as {
        default: {
          initHealthKit: (
            opts: { permissions: { read: string[]; write: string[] } },
            cb: (err: string | null) => void,
          ) => void;
          Constants: { Permissions: { [k: string]: string } };
        };
      };
      const HK = mod.default;
      const P = HK.Constants.Permissions;
      await new Promise<void>((resolve, reject) => {
        HK.initHealthKit(
          {
            permissions: {
              read: [P["HeartRate"]!, P["ActiveEnergyBurned"]!, P["DistanceSwimming"]!],
              write: [P["Workout"]!, P["ActiveEnergyBurned"]!, P["DistanceSwimming"]!],
            },
          },
          (err) => (err ? reject(new Error(err)) : resolve()),
        );
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
      const mod = require("react-native-health") as {
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
      };
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
