import * as FileSystem from "expo-file-system/legacy";
import type { Session, TrackPoint } from "@/models";
import { toGpx } from "./gpx";

function getRoot(): string {
  const dir = FileSystem.documentDirectory;
  if (!dir) throw new Error("FileSystem.documentDirectory is unavailable");
  return `${dir}sessions/`;
}

export interface StoredSession {
  session: Session;
  track: TrackPoint[];
  synced: boolean;
}

export interface SessionSummary {
  session: Session;
  synced: boolean;
}

async function ensureRoot(): Promise<string> {
  const root = getRoot();
  const info = await FileSystem.getInfoAsync(root);
  if (!info.exists) await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  return root;
}

// ── Sync index ──────────────────────────────────────────────────────────────
// Small `{ [sessionId]: true }` file recording which sessions have reached
// Firestore, so sign-in re-sync skips already-uploaded sessions.

function syncIndexUri(): string {
  return `${getRoot()}sync-index.json`;
}

async function readSyncIndex(): Promise<Record<string, true>> {
  try {
    const raw = await FileSystem.readAsStringAsync(syncIndexUri());
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, true>) : {};
  } catch {
    return {};
  }
}

export async function markSynced(id: string): Promise<void> {
  await ensureRoot();
  const index = await readSyncIndex();
  index[id] = true;
  await FileSystem.writeAsStringAsync(syncIndexUri(), JSON.stringify(index));
}

export async function save(session: Session, track: TrackPoint[]): Promise<void> {
  const root = await ensureRoot();
  const dir = `${root}${session.id}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  await FileSystem.writeAsStringAsync(`${dir}session.json`, JSON.stringify(session));
  await FileSystem.writeAsStringAsync(`${dir}track.json`, JSON.stringify(track));
  await FileSystem.writeAsStringAsync(`${dir}track.gpx`, toGpx(session, track));
}

/**
 * List all stored sessions reading only session.json — not the (potentially
 * large) GPS track — so summary screens don't parse megabytes of points per
 * focus. Use load(id) when the full track is needed.
 */
export async function listSummaries(): Promise<SessionSummary[]> {
  const root = await ensureRoot();
  const ids = await FileSystem.readDirectoryAsync(root).catch(() => [] as string[]);
  const index = await readSyncIndex();
  const out: SessionSummary[] = [];
  for (const id of ids) {
    try {
      const sj = await FileSystem.readAsStringAsync(`${root}${id}/session.json`);
      out.push({ session: JSON.parse(sj) as Session, synced: index[id] === true });
    } catch {
      // skip malformed dirs (and the sync-index file itself)
    }
  }
  return out.sort((a, b) =>
    a.session.startedAt > b.session.startedAt ? -1 : a.session.startedAt < b.session.startedAt ? 1 : 0,
  );
}

export async function load(id: string): Promise<StoredSession | null> {
  try {
    const dir = `${getRoot()}${id}/`;
    const sj = await FileSystem.readAsStringAsync(`${dir}session.json`);
    const tj = await FileSystem.readAsStringAsync(`${dir}track.json`);
    const index = await readSyncIndex();
    return {
      session: JSON.parse(sj) as Session,
      track: JSON.parse(tj) as TrackPoint[],
      synced: index[id] === true,
    };
  } catch {
    return null;
  }
}

export function gpxUriFor(id: string): string {
  return `${getRoot()}${id}/track.gpx`;
}

export async function remove(id: string): Promise<void> {
  await FileSystem.deleteAsync(`${getRoot()}${id}/`, { idempotent: true });
  const index = await readSyncIndex();
  if (index[id]) {
    delete index[id];
    await FileSystem.writeAsStringAsync(syncIndexUri(), JSON.stringify(index)).catch(
      () => undefined,
    );
  }
}
