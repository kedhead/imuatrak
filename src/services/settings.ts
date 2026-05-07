import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import type { CraftType } from "@/models";

const KEY_UNITS = "imuatrak.units";
const KEY_DEFAULT_CRAFT = "imuatrak.defaultCraft";

export type Units = "metric" | "imperial";

interface SettingsState {
  units: Units;
  defaultCraft: CraftType;
  loaded: boolean;
  load: () => Promise<void>;
  setUnits: (u: Units) => Promise<void>;
  setDefaultCraft: (c: CraftType) => Promise<void>;
}

export const useSettings = create<SettingsState>((set) => ({
  units: "metric",
  defaultCraft: "OC1",
  loaded: false,

  async load() {
    const [u, c] = await Promise.all([
      AsyncStorage.getItem(KEY_UNITS),
      AsyncStorage.getItem(KEY_DEFAULT_CRAFT),
    ]);
    set({
      units: (u as Units | null) ?? "metric",
      defaultCraft: (c as CraftType | null) ?? "OC1",
      loaded: true,
    });
  },

  async setUnits(u) {
    set({ units: u });
    await AsyncStorage.setItem(KEY_UNITS, u);
  },

  async setDefaultCraft(c) {
    set({ defaultCraft: c });
    await AsyncStorage.setItem(KEY_DEFAULT_CRAFT, c);
  },
}));
