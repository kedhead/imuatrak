import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Last-known data, kept on the phone so screens can paint immediately and
 * refresh in the background ("stale-while-revalidate").
 *
 * Why this exists: the Firebase JS SDK has no persistent cache on React
 * Native (it needs IndexedDB), and most screens fetch with one-shot reads, so
 * every screen used to open blank and wait on the network. On beach signal
 * that read as the app stalling.
 *
 * Rules of the road:
 * - Display only. Security is still enforced by Firestore rules; a stale
 *   cached role can show a button, but the write behind it is still checked.
 * - Namespaced per signed-in user and wiped on sign-out, so one account's
 *   club data never shows under another on a shared phone.
 * - Never throws: a cache miss, a full disk or corrupt JSON all just mean
 *   "no cache", and the caller falls back to the network.
 */
const PREFIX = "cache:v1:";
/** Anything older is ignored — better a spinner than a month-old roster. */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

interface Entry<T> {
  at: number;
  value: T;
}

const key = (uid: string, name: string) => `${PREFIX}${uid}:${name}`;

/** Parse a stored entry; null if missing, corrupt or too old. Exported for tests. */
export function decodeEntry<T>(raw: string | null, now = Date.now()): T | null {
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as Entry<T>;
    if (typeof entry?.at !== "number" || now - entry.at > MAX_AGE_MS || now < entry.at - 60_000) {
      return null;
    }
    return entry.value ?? null;
  } catch {
    return null;
  }
}

export function encodeEntry<T>(value: T, now = Date.now()): string {
  return JSON.stringify({ at: now, value } satisfies Entry<T>);
}

export async function readCache<T>(uid: string, name: string): Promise<T | null> {
  try {
    return decodeEntry<T>(await AsyncStorage.getItem(key(uid, name)));
  } catch {
    return null;
  }
}

/** Fire-and-forget by design; callers don't await it. */
export function writeCache<T>(uid: string, name: string, value: T): void {
  void AsyncStorage.setItem(key(uid, name), encodeEntry(value)).catch(() => undefined);
}

/** Drop everything cached for every account (called on sign-out). */
export async function clearCache(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    if (keys.length > 0) await AsyncStorage.multiRemove(keys);
  } catch {
    // Nothing useful to do; stale entries also expire on their own.
  }
}
