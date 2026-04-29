import Constants from "expo-constants";
import { Platform } from "react-native";
import { create } from "zustand";

import {
  SCHEMA_VERSION,
  emptyHr,
  emptyTotals,
  type CraftType,
  type Session,
  type SessionSource,
  type TrackPoint,
} from "@/models";

import * as aggregator from "./aggregator";
import { auth } from "./firebase";
import { downsample } from "./geo";
import * as health from "./health";
import * as location from "./location";
import * as motion from "./motion";
import * as storage from "./storage";
import { syncSession } from "./sync";

export interface LiveStats {
  isRecording: boolean;
  startedAtMs: number;
  durationSec: number;
  distanceMeters: number;
  currentSpeedMps: number;
  currentStrokeRate: number;
  strokeCount: number;
  currentHr?: number;
}

interface RecorderState extends LiveStats {
  craftType: CraftType;
  setCraftType: (c: CraftType) => void;
  start: () => Promise<void>;
  stopAndSave: () => Promise<Session | null>;
  discard: () => void;
}

const empty: LiveStats = {
  isRecording: false,
  startedAtMs: 0,
  durationSec: 0,
  distanceMeters: 0,
  currentSpeedMps: 0,
  currentStrokeRate: 0,
  strokeCount: 0,
};

let track: TrackPoint[] = [];
let strokeCount = 0;
let lastStrokeRate = 0;
let sessionId: string | null = null;
let unsubLocation: (() => void) | null = null;
let unsubMotion: (() => void) | null = null;
let tickHandle: ReturnType<typeof setInterval> | null = null;

const sessionSource: SessionSource =
  Platform.OS === "ios" ? "ios-phone" : Platform.OS === "android" ? "android-phone" : "ios-phone";

export const useRecorder = create<RecorderState>((set, get) => ({
  ...empty,
  craftType: "OC1",

  setCraftType: (c) => set({ craftType: c }),

  async start() {
    if (get().isRecording) return;
    const ok = await location.requestPermissions();
    if (!ok) throw new Error("Location permission denied");

    sessionId = nanoidLite();
    track = [];
    strokeCount = 0;
    lastStrokeRate = 0;
    set({ ...empty, isRecording: true, startedAtMs: Date.now(), craftType: get().craftType });

    unsubLocation = location.subscribe((s) => {
      const startedAtMs = get().startedAtMs;
      const tSec = (s.tEpochMs - startedAtMs) / 1000;
      const point: TrackPoint = {
        t: tSec,
        lat: s.lat,
        lon: s.lon,
        altM: s.altM,
        speedMps: s.speedMps,
        ...(lastStrokeRate > 0 ? { strokeRate: lastStrokeRate } : {}),
      };
      track.push(point);
      const totals = aggregator.totals(track, strokeCount);
      set({
        durationSec: tSec,
        distanceMeters: totals.distanceMeters,
        currentSpeedMps: s.speedMps,
        strokeCount,
      });
    });

    unsubMotion = motion.subscribe((stroke) => {
      strokeCount += 1;
      lastStrokeRate = stroke.rateSpm;
      set({ currentStrokeRate: stroke.rateSpm, strokeCount });
    });

    await location.startBackgroundUpdates();

    // Tick every second so the timer advances even when no GPS sample lands.
    tickHandle = setInterval(() => {
      const startedAtMs = get().startedAtMs;
      if (!startedAtMs) return;
      set({ durationSec: (Date.now() - startedAtMs) / 1000 });
    }, 1000);
  },

  async stopAndSave() {
    const state = get();
    if (!state.isRecording || !sessionId) return null;

    cleanup();
    set({ isRecording: false });

    const totals = aggregator.totals(track, strokeCount);
    const splits = aggregator.splits(track);
    const hr = aggregator.hrSummary(track);
    const summary = downsample(track, 200).map((p) => ({
      t: p.t,
      lat: p.lat,
      lon: p.lon,
      altM: p.altM,
      speedMps: p.speedMps,
    }));

    const startedAt = new Date(state.startedAtMs).toISOString();
    const endedAt = new Date().toISOString();
    const session: Session = {
      id: sessionId,
      userId: auth.currentUser?.uid ?? "anonymous",
      schemaVersion: SCHEMA_VERSION,
      source: sessionSource,
      appVersion: (Constants.expoConfig?.version as string) ?? "0.1.0",
      craftType: state.craftType,
      startedAt,
      endedAt,
      totals,
      hr,
      splits,
      sideSwitches: [],
      trackSummary: summary,
    };

    await storage.save(session, track);

    // Best-effort: write to Apple Health / Health Connect, then push to Firebase.
    void health
      .writePaddlingWorkout({
        startedAt: new Date(startedAt),
        endedAt: new Date(endedAt),
        distanceMeters: totals.distanceMeters,
        calories: totals.calories,
      })
      .catch(() => undefined);
    if (auth.currentUser) {
      void syncSession(session).catch(() => undefined);
    }

    sessionId = null;
    track = [];
    strokeCount = 0;
    lastStrokeRate = 0;
    set({ ...empty, craftType: state.craftType });
    return session;
  },

  discard() {
    cleanup();
    sessionId = null;
    track = [];
    strokeCount = 0;
    lastStrokeRate = 0;
    set({ ...empty, craftType: get().craftType });
  },
}));

function cleanup(): void {
  unsubLocation?.();
  unsubMotion?.();
  unsubLocation = null;
  unsubMotion = null;
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = null;
  void location.stopBackgroundUpdates();
}

/**
 * Cheap session-id generator. Avoids pulling in `nanoid` async machinery
 * for an id that's only used as a Firestore doc name.
 */
function nanoidLite(): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 16; i++) out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  return `${Date.now().toString(36)}-${out}`;
}
