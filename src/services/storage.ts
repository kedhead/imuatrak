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

async function ensureRoot(): Promise<string> {
  const root = getRoot();
  const info = await FileSystem.getInfoAsync(root);
  if (!info.exists) await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  return root;
}

export async function save(session: Session, track: TrackPoint[]): Promise<void> {
  const root = await ensureRoot();
  const dir = `${root}${session.id}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  await FileSystem.writeAsStringAsync(`${dir}session.json`, JSON.stringify(session));
  await FileSystem.writeAsStringAsync(`${dir}track.json`, JSON.stringify(track));
  await FileSystem.writeAsStringAsync(`${dir}track.gpx`, toGpx(session, track));
}

export async function list(): Promise<StoredSession[]> {
  const root = await ensureRoot();
  const ids = await FileSystem.readDirectoryAsync(root).catch(() => [] as string[]);
  const out: StoredSession[] = [];
  for (const id of ids) {
    const dir = `${root}${id}/`;
    try {
      const sj = await FileSystem.readAsStringAsync(`${dir}session.json`);
      const tj = await FileSystem.readAsStringAsync(`${dir}track.json`);
      out.push({
        session: JSON.parse(sj) as Session,
        track: JSON.parse(tj) as TrackPoint[],
        synced: false, // sync state will live in a small index file once we wire sync
      });
    } catch {
      // skip malformed dirs
    }
  }
  return out.sort((a, b) =>
    a.session.startedAt > b.session.startedAt ? -1 : a.session.startedAt < b.session.startedAt ? 1 : 0,
  );
}

export async function load(id: string): Promise<StoredSession | null> {
  const dir = `${getRoot()}${id}/`;
  try {
    const sj = await FileSystem.readAsStringAsync(`${dir}session.json`);
    const tj = await FileSystem.readAsStringAsync(`${dir}track.json`);
    return {
      session: JSON.parse(sj) as Session,
      track: JSON.parse(tj) as TrackPoint[],
      synced: false,
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
}
