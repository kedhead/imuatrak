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
  type WeatherSample,
  type WeatherSummary,
} from "@/models";

import * as aggregator from "./aggregator";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "./firebase";
import { useSettings } from "./settings";
import { downsample } from "./geo";
import * as health from "./health";
import * as location from "./location";
import * as motion from "./motion";
import * as storage from "./storage";
import { syncSession } from "./sync";

export interface LiveStats {
  isRecording: boolean;
  /** True while the session is paused — the timer, distance and strokes hold
   *  and GPS samples are dropped until the user resumes. */
  isPaused: boolean;
  startedAtMs: number;
  durationSec: number;
  distanceMeters: number;
  currentSpeedMps: number;
  currentStrokeRate: number;
  strokeCount: number;
  currentHr?: number;
  /** GPS fixes received this session — ticks ~1/s even when stationary. */
  gpsPointCount: number;
  /** Reported accuracy of the latest fix, in meters (0 = no fix yet). */
  gpsAccuracyM: number;
}

interface RecorderState extends LiveStats {
  craftType: CraftType;
  setCraftType: (c: CraftType) => void;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stopAndSave: () => Promise<Session | null>;
  discard: () => void;
}

const empty: LiveStats = {
  isRecording: false,
  isPaused: false,
  startedAtMs: 0,
  durationSec: 0,
  distanceMeters: 0,
  currentSpeedMps: 0,
  currentStrokeRate: 0,
  strokeCount: 0,
  gpsPointCount: 0,
  gpsAccuracyM: 0,
};

let track: TrackPoint[] = [];
let strokeCount = 0;
let lastStrokeRate = 0;
let sessionId: string | null = null;
let unsubLocation: (() => void) | null = null;
let unsubMotion: (() => void) | null = null;
let tickHandle: ReturnType<typeof setInterval> | null = null;
// Paused-time bookkeeping so the timer and track timeline exclude pauses.
// pausedAccumMs is the total already-elapsed pause time; pauseStartedMs marks
// the start of the current pause (0 when running).
let pausedAccumMs = 0;
let pauseStartedMs = 0;

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

    // Android only: request Health Connect access so finished sessions can be
    // exported. No-op on iOS (ImuaTrak does not integrate with Apple Health).
    // Best-effort: guarded internally, never blocks recording.
    await health.requestAuthorization();

    sessionId = nanoidLite();
    track = [];
    strokeCount = 0;
    lastStrokeRate = 0;
    pausedAccumMs = 0;
    pauseStartedMs = 0;
    set({ ...empty, isRecording: true, startedAtMs: Date.now(), craftType: get().craftType });

    try {
      subscribeAndStart(set, get);
      await location.startBackgroundUpdates();
    } catch (e) {
      // A failed start (e.g. background updates rejected because the user only
      // granted "While Using") must not leave a half-started recording behind:
      // tear down subscriptions and reset state before surfacing the error.
      get().discard();
      throw e;
    }
  },

  pause() {
    if (!get().isRecording || get().isPaused) return;
    // Keep the background location service running (so the foreground
    // notification and permission stay live and resume is instant); the
    // sample handlers just drop everything while paused.
    pauseStartedMs = Date.now();
    set({ isPaused: true });
  },

  resume() {
    if (!get().isRecording || !get().isPaused) return;
    if (pauseStartedMs > 0) {
      pausedAccumMs += Date.now() - pauseStartedMs;
      pauseStartedMs = 0;
    }
    set({ isPaused: false });
  },

  async stopAndSave() {
    const state = get();
    if (!state.isRecording || !sessionId) return null;

    cleanup();
    set({ isRecording: false });

    const weightKg = useSettings.getState().weightKg;
    const totals = aggregator.totals(track, strokeCount, weightKg);
    const splits = aggregator.splits(track);
    const hr = aggregator.hrSummary(track);
    const summary = downsample(track, 200).map((p) => ({
      t: p.t,
      lat: p.lat,
      lon: p.lon,
      altM: p.altM,
      speedMps: p.speedMps,
    }));

    // Best-effort weather fetch at both session start and end (parallel, 6 s timeout).
    let weather: WeatherSummary | undefined;
    if (track.length > 0 && auth.currentUser) {
      try {
        type WResp = { windMps: number; windDeg: number; gustMps: number; airTempC: number; pressureHpa: number; conditions: string };
        const fn = httpsCallable<{ lat: number; lon: number }, WResp>(functions, "fetchWeather");
        const deadline = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 6000));
        const first = track[0]!;
        const last = track[track.length - 1]!;
        const startCall = fn({ lat: first.lat, lon: first.lon });
        const endCall = last !== first ? fn({ lat: last.lat, lon: last.lon }) : startCall;
        const [startRes, endRes] = await Promise.race([
          Promise.allSettled([startCall, endCall]),
          deadline,
        ]);
        const toSample = (w: WResp, tSec: number): WeatherSample => ({
          tSec, windMps: w.windMps, windDeg: w.windDeg, gustMps: w.gustMps,
          airTempC: w.airTempC, pressureHpa: w.pressureHpa, conditions: w.conditions,
        });
        if (startRes.status === "fulfilled") {
          const startSample = toSample(startRes.value.data, 0);
          const endSample = endRes.status === "fulfilled" ? toSample(endRes.value.data, last.t - first.t) : undefined;
          weather = { start: startSample, end: endSample, samples: [startSample, ...(endSample ? [endSample] : [])] };
        }
      } catch {
        // Weather is non-critical — continue without it.
      }
    }

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
      weather,
    };

    await storage.save(session, track);

    // Best-effort: export to Android Health Connect (no-op on iOS), then push to Firebase.
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

function subscribeAndStart(
  set: (partial: Partial<RecorderState>) => void,
  get: () => RecorderState,
): void {
  unsubLocation = location.subscribe((s) => {
    // Drop fixes while paused so the route doesn't draw a straight line across
    // the pause and distance/pace ignore the break. The timer owns durationSec.
    if (get().isPaused) return;
    const startedAtMs = get().startedAtMs;
    // Exclude accumulated pause time so the track timeline (and therefore pace
    // and splits) matches the displayed elapsed time.
    const tSec = (s.tEpochMs - startedAtMs - pausedAccumMs) / 1000;
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
      distanceMeters: totals.distanceMeters,
      currentSpeedMps: s.speedMps,
      strokeCount,
      gpsPointCount: track.length,
      gpsAccuracyM: s.accuracyM,
    });
  });

  unsubMotion = motion.subscribe((stroke) => {
    if (get().isPaused) return;
    strokeCount += 1;
    lastStrokeRate = stroke.rateSpm;
    set({ currentStrokeRate: stroke.rateSpm, strokeCount });
  });

  // Tick every second so the timer advances even when no GPS sample lands.
  // Elapsed excludes pause time; while paused the value holds steady.
  tickHandle = setInterval(() => {
    const startedAtMs = get().startedAtMs;
    if (!startedAtMs) return;
    const inPause = get().isPaused && pauseStartedMs > 0 ? Date.now() - pauseStartedMs : 0;
    const effMs = Date.now() - startedAtMs - pausedAccumMs - inPause;
    set({ durationSec: Math.max(0, effMs) / 1000 });
  }, 1000);
}

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
