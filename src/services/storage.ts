import * as FileSystem from "expo-file-system";
import type { Session, TrackPoint } from "@/models";
import { toGpx } from "./gpx";

const ROOT = `${FileSystem.documentDirectory}sessions/`;

export interface StoredSession {
  session: Session;
  track: TrackPoint[];
  synced: boolean;
}

async function ensureRoot(): Promise<void> {
  const info = await FileSystem.getInfoAsync(ROOT);
  if (!info.exists) await FileSystem.makeDirectoryAsync(ROOT, { intermediates: true });
}

export async function save(session: Session, track: TrackPoint[]): Promise<void> {
  await ensureRoot();
  const dir = `${ROOT}${session.id}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  await FileSystem.writeAsStringAsync(`${dir}session.json`, JSON.stringify(session));
  await FileSystem.writeAsStringAsync(`${dir}track.json`, JSON.stringify(track));
  await FileSystem.writeAsStringAsync(`${dir}track.gpx`, toGpx(session, track));
}

export async function list(): Promise<StoredSession[]> {
  await ensureRoot();
  const ids = await FileSystem.readDirectoryAsync(ROOT).catch(() => [] as string[]);
  const out: StoredSession[] = [];
  for (const id of ids) {
    const dir = `${ROOT}${id}/`;
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
  const dir = `${ROOT}${id}/`;
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
  return `${ROOT}${id}/track.gpx`;
}

export async function remove(id: string): Promise<void> {
  await FileSystem.deleteAsync(`${ROOT}${id}/`, { idempotent: true });
}
