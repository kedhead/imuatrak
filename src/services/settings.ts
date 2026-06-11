import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import type { CraftType } from "@/models";
import { pushSettingsToWatch } from "./watchHandoff";

const KEY_UNITS = "imuatrak.units";
const KEY_DEFAULT_CRAFT = "imuatrak.defaultCraft";
const KEY_WEIGHT_KG = "imuatrak.weightKg";
const KEY_GOAL_DIST_KM = "imuatrak.weeklyGoalDistanceKm";
const KEY_GOAL_DUR_MIN = "imuatrak.weeklyGoalDurationMin";

export type Units = "metric" | "imperial";

interface SettingsState {
  units: Units;
  defaultCraft: CraftType;
  weightKg: number;
  weeklyGoalDistanceKm: number;
  weeklyGoalDurationMin: number;
  loaded: boolean;
  load: () => Promise<void>;
  setUnits: (u: Units) => Promise<void>;
  setDefaultCraft: (c: CraftType) => Promise<void>;
  setWeightKg: (w: number) => Promise<void>;
  setWeeklyGoalDistanceKm: (v: number) => Promise<void>;
  setWeeklyGoalDurationMin: (v: number) => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => {
  // Mirror the goal/pref state to the paired Apple Watch (best-effort no-op
  // without a watch) so the watch's goal glance stays in sync.
  const syncToWatch = () => {
    const s = get();
    void pushSettingsToWatch({
      weeklyGoalDistanceKm: s.weeklyGoalDistanceKm,
      weeklyGoalDurationMin: s.weeklyGoalDurationMin,
      units: s.units,
      defaultCraft: s.defaultCraft,
    });
  };

  return {
    units: "metric",
    defaultCraft: "OC1",
    weightKg: 75,
    weeklyGoalDistanceKm: 0,
    weeklyGoalDurationMin: 0,
    loaded: false,

    async load() {
      const [u, c, w, gd, gt] = await Promise.all([
        AsyncStorage.getItem(KEY_UNITS),
        AsyncStorage.getItem(KEY_DEFAULT_CRAFT),
        AsyncStorage.getItem(KEY_WEIGHT_KG),
        AsyncStorage.getItem(KEY_GOAL_DIST_KM),
        AsyncStorage.getItem(KEY_GOAL_DUR_MIN),
      ]);
      set({
        units: (u as Units | null) ?? "metric",
        defaultCraft: (c as CraftType | null) ?? "OC1",
        weightKg: w != null ? parseFloat(w) : 75,
        weeklyGoalDistanceKm: gd != null ? parseFloat(gd) : 0,
        weeklyGoalDurationMin: gt != null ? parseFloat(gt) : 0,
        loaded: true,
      });
      syncToWatch();
    },

    async setUnits(u) {
      set({ units: u });
      await AsyncStorage.setItem(KEY_UNITS, u);
      syncToWatch();
    },

    async setDefaultCraft(c) {
      set({ defaultCraft: c });
      await AsyncStorage.setItem(KEY_DEFAULT_CRAFT, c);
      syncToWatch();
    },

    async setWeightKg(w) {
      set({ weightKg: w });
      await AsyncStorage.setItem(KEY_WEIGHT_KG, String(w));
    },

    async setWeeklyGoalDistanceKm(v) {
      set({ weeklyGoalDistanceKm: v });
      await AsyncStorage.setItem(KEY_GOAL_DIST_KM, String(v));
      syncToWatch();
    },

    async setWeeklyGoalDurationMin(v) {
      set({ weeklyGoalDurationMin: v });
      await AsyncStorage.setItem(KEY_GOAL_DUR_MIN, String(v));
      syncToWatch();
    },
  };
});
