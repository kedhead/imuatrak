import { Accelerometer } from "expo-sensors";
import type { EventSubscription } from "expo-modules-core";
import { StrokeDetector, type Stroke } from "./stroke-detector";

export type StrokeListener = (s: Stroke) => void;

let sub: EventSubscription | null = null;
let detector: StrokeDetector | null = null;
let t0: number | null = null;
const listeners = new Set<StrokeListener>();

export function subscribe(cb: StrokeListener): () => void {
  listeners.add(cb);
  if (!sub) start();
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) stop();
  };
}

function start(): void {
  Accelerometer.setUpdateInterval(20); // 50 Hz
  detector = new StrokeDetector({ sampleRateHz: 50 });
  t0 = null;
  sub = Accelerometer.addListener(({ x, y, z }) => {
    const now = Date.now();
    if (t0 == null) t0 = now;
    const tSec = (now - t0) / 1000;
    // expo-sensors returns acceleration in g; convert to m/s² and remove
    // gravity by subtracting unit-vector magnitude on z (rough, but the
    // detector's high-pass cleans it up).
    const ax = x * 9.80665;
    const ay = y * 9.80665;
    const az = (z - 1) * 9.80665;
    const stroke = detector!.onSample(tSec, ax, ay, az);
    if (stroke) for (const l of listeners) l(stroke);
  });
}

function stop(): void {
  sub?.remove();
  sub = null;
  detector = null;
  t0 = null;
}
