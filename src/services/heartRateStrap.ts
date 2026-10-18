import AsyncStorage from "@react-native-async-storage/async-storage";
import { PermissionsAndroid, Platform } from "react-native";
import BleManager, { BleState } from "react-native-ble-manager";
import { create } from "zustand";
import { parseHeartRateMeasurement, usableBpm } from "./heartRateParse";

/**
 * Bluetooth heart-rate chest straps (Garmin HRM-Dual / HRM-Pro / HRM-Fit /
 * HRM 600, and any other strap speaking the standard Heart Rate service).
 *
 * Phone recordings had no heart rate source at all — it only ever came from a
 * watch. This connects to a strap the user picks once, remembers it, and while
 * anything "holds" the connection (a recording, or the pairing screen showing a
 * live reading) keeps it connected and reconnects after drop-outs. A strap
 * going under water on a huli is the expected drop-out: Bluetooth doesn't pass
 * through water, and the reading simply resumes when it surfaces.
 *
 * ANT+-only straps (older Garmin HRM-Run, HRM-Tri) cannot work: iPhones have no
 * ANT+ radio and Android phones have largely dropped it.
 */

const HR_SERVICE = "180D";
const HR_MEASUREMENT = "2A37";
const KEY_STRAP = "imuatrak.hrStrap";
/** A reading older than this is not "current" — the strap has gone quiet. */
const STALE_MS = 5000;
const SCAN_SECONDS = 10;
const RETRY_DELAYS_MS = [2000, 4000, 8000, 15000];

export interface SavedStrap {
  id: string;
  name: string;
}

export interface FoundStrap {
  id: string;
  name: string;
  rssi: number;
}

export type StrapStatus =
  | "idle" //            no strap saved, or nothing holding a connection
  | "connecting"
  | "connected"
  | "reconnecting" //    was connected (or tried), retrying on a timer
  | "bluetoothOff"
  | "noPermission";

interface StrapState {
  loaded: boolean;
  saved: SavedStrap | null;
  status: StrapStatus;
  /** Last usable reading. Read through `currentBpm()` to respect staleness. */
  bpm: number | null;
  /** False when the strap says it has lost skin contact. */
  contact: boolean | null;
  lastReadingAt: number;
  scanning: boolean;
  found: FoundStrap[];
}

export const useHeartRateStrap = create<StrapState>(() => ({
  loaded: false,
  saved: null,
  status: "idle",
  bpm: null,
  contact: null,
  lastReadingAt: 0,
  scanning: false,
  found: [],
}));

const set = useHeartRateStrap.setState;
const get = useHeartRateStrap.getState;

// ── Module state ────────────────────────────────────────────────────────────
let started: Promise<void> | null = null;
let holders = 0;
let connectedId: string | null = null;
let connectInFlight = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryIndex = 0;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalise a UUID to its 16-bit short form where it has one. iOS reports
 * standard UUIDs short ("2A37"), Android reports the full 128-bit form
 * ("00002a37-0000-1000-8000-00805f9b34fb").
 */
function shortUuid(uuid: string): string {
  const u = uuid.toUpperCase();
  const m = /^0000([0-9A-F]{4})-0000-1000-8000-00805F9B34FB$/.exec(u);
  return m ? m[1]! : u;
}

/** Android reports MAC addresses in whichever case it likes. */
function sameDevice(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toUpperCase() === b.toUpperCase();
}

async function load(): Promise<void> {
  if (get().loaded) return;
  try {
    const raw = await AsyncStorage.getItem(KEY_STRAP);
    set({ saved: raw ? (JSON.parse(raw) as SavedStrap) : null, loaded: true });
  } catch {
    set({ loaded: true });
  }
}

function ensureStarted(): Promise<void> {
  if (started) return started;
  started = (async () => {
    await BleManager.start({ showAlert: false });
    BleManager.onDiscoverPeripheral((p) => {
      const name = p.name ?? p.advertising?.localName ?? "Heart rate strap";
      const found = get().found.filter((f) => f.id !== p.id);
      found.push({ id: p.id, name, rssi: p.rssi });
      found.sort((a, b) => b.rssi - a.rssi); // nearest first
      set({ found });
    });
    BleManager.onStopScan(() => set({ scanning: false }));
    BleManager.onDisconnectPeripheral((e) => {
      if (!sameDevice(e.peripheral, get().saved?.id)) return;
      connectedId = null;
      set({ bpm: null, contact: null });
      if (holders > 0) {
        set({ status: "reconnecting" });
        scheduleRetry();
      } else {
        set({ status: "idle" });
      }
    });
    BleManager.onDidUpdateValueForCharacteristic((e) => {
      if (shortUuid(e.characteristic) !== HR_MEASUREMENT) return;
      if (!sameDevice(e.peripheral, get().saved?.id)) return;
      const m = parseHeartRateMeasurement(e.value);
      set({ bpm: usableBpm(m), contact: m?.contact ?? null, lastReadingAt: Date.now() });
    });
    BleManager.onDidUpdateState((e) => {
      if (e.state === BleState.On) {
        if (get().status === "bluetoothOff") set({ status: "idle" });
        if (holders > 0) void connectSaved();
      } else if (e.state === BleState.Off) {
        connectedId = null;
        set({ status: "bluetoothOff", bpm: null, contact: null });
      }
    });
  })().catch((e) => {
    // Let a later call try again rather than caching a failed start forever.
    started = null;
    throw e;
  });
  return started;
}

/**
 * Android needs runtime permission to scan and connect. Location is included
 * because the BLE plugin is configured without `neverForLocation` (see
 * app.config.js) — on Android 12+ scanning then requires it, and the app
 * already asks for it to record GPS, so this rarely prompts. iOS prompts for
 * Bluetooth by itself the first time the manager is used.
 */
async function requestPermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  const P = PermissionsAndroid.PERMISSIONS;
  const wanted =
    typeof Platform.Version === "number" && Platform.Version >= 31
      ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT, P.ACCESS_FINE_LOCATION]
      : [P.ACCESS_FINE_LOCATION];
  const result = await PermissionsAndroid.requestMultiple(wanted);
  return wanted.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED);
}

/** True when Bluetooth is on (asking Android to turn it on if it's off). */
async function bluetoothReady(): Promise<boolean> {
  const state = await BleManager.checkState();
  if (state === BleState.On) return true;
  if (Platform.OS === "android") {
    try {
      await BleManager.enableBluetooth();
      return true;
    } catch {
      // User declined the system prompt.
    }
  }
  set({ status: "bluetoothOff" });
  return false;
}

function clearRetry(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

function scheduleRetry(): void {
  if (holders === 0 || retryTimer) return;
  const delay = RETRY_DELAYS_MS[Math.min(retryIndex, RETRY_DELAYS_MS.length - 1)]!;
  retryIndex += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void connectSaved();
  }, delay);
}

async function connectSaved(): Promise<void> {
  const saved = get().saved;
  if (!saved || holders === 0 || connectInFlight || sameDevice(connectedId, saved.id)) return;
  connectInFlight = true;
  clearRetry();
  try {
    await ensureStarted();
    if (!(await requestPermissions())) {
      set({ status: "noPermission" });
      return;
    }
    if (!(await bluetoothReady())) return;
    if (get().status !== "reconnecting") set({ status: "connecting" });

    // No scan needed: iOS retrieves a known peripheral by identifier and Android
    // by address. On iOS this call stays pending until the strap is in range,
    // which is exactly the behaviour wanted when it has gone under water.
    await BleManager.connect(saved.id);
    await BleManager.retrieveServices(saved.id, [HR_SERVICE]);
    await BleManager.startNotification(saved.id, HR_SERVICE, HR_MEASUREMENT);

    // Everything that wanted the strap may have let go while we connected.
    if (holders === 0 || !sameDevice(get().saved?.id, saved.id)) {
      await BleManager.disconnect(saved.id).catch(() => undefined);
      return;
    }
    connectedId = saved.id;
    retryIndex = 0;
    set({ status: "connected" });
  } catch {
    // Out of range, switched off, or connected to something else (the HRM-Dual
    // allows one Bluetooth connection at a time). Keep trying while held.
    if (holders > 0) {
      set({ status: "reconnecting" });
      scheduleRetry();
    }
  } finally {
    connectInFlight = false;
    // A different strap was chosen while this attempt was in flight. Its own
    // connect was skipped (one attempt at a time), so start it now that this
    // one has finished — otherwise the new strap would sit unconnected.
    if (holders > 0 && get().saved && !sameDevice(get().saved?.id, saved.id)) {
      void connectSaved();
    }
  }
}

async function disconnectNow(): Promise<void> {
  clearRetry();
  retryIndex = 0;
  const id = connectedId ?? get().saved?.id;
  connectedId = null;
  set({ status: "idle", bpm: null, contact: null });
  if (!id || !started) return;
  await BleManager.stopNotification(id, HR_SERVICE, HR_MEASUREMENT).catch(() => undefined);
  await BleManager.disconnect(id).catch(() => undefined);
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Load the remembered strap. Cheap to call repeatedly. */
export async function loadSavedStrap(): Promise<SavedStrap | null> {
  await load();
  return get().saved;
}

/**
 * Keep the saved strap connected until the returned function is called.
 * Several callers can hold at once (a recording and the pairing screen); the
 * connection drops when the last one lets go. Safe to call with no strap saved.
 */
export function holdConnection(): () => void {
  holders += 1;
  void load().then(connectSaved);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (holders === 0) void disconnectNow();
  };
}

/** The current heart rate, or null if there's no fresh, trustworthy reading. */
export function currentBpm(): number | null {
  const { bpm, lastReadingAt } = get();
  if (bpm == null || Date.now() - lastReadingAt > STALE_MS) return null;
  return bpm;
}

/** Look for nearby straps advertising the Heart Rate service. */
export async function scanForStraps(): Promise<void> {
  await ensureStarted();
  if (!(await requestPermissions())) {
    set({ status: "noPermission" });
    return;
  }
  if (!(await bluetoothReady())) return;
  set({ found: [], scanning: true });
  try {
    await BleManager.scan({ serviceUUIDs: [HR_SERVICE], seconds: SCAN_SECONDS });
  } catch {
    set({ scanning: false });
  }
}

export async function stopScan(): Promise<void> {
  if (!started) return;
  await BleManager.stopScan().catch(() => undefined);
  set({ scanning: false });
}

/** Remember a strap and connect to it if anything is holding a connection. */
export async function chooseStrap(strap: FoundStrap): Promise<void> {
  await stopScan();
  const previous = get().saved;
  if (previous && !sameDevice(previous.id, strap.id)) await disconnectNow();
  const saved: SavedStrap = { id: strap.id, name: strap.name };
  await AsyncStorage.setItem(KEY_STRAP, JSON.stringify(saved));
  set({ saved, loaded: true });
  if (holders > 0) void connectSaved();
}

export async function forgetStrap(): Promise<void> {
  await disconnectNow();
  await AsyncStorage.removeItem(KEY_STRAP);
  set({ saved: null });
}
