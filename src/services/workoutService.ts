/**
 * Club Training log — Firestore reads/writes. Shapes must satisfy
 * firestore.rules (workouts / workoutWeeks); see src/models/workouts.ts.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import type { Session } from "@/models";
import {
  localDate,
  paddleWorkoutId,
  WORKOUT_MINUTES_MAX,
  type Workout,
  type WorkoutKind,
  type WorkoutWeek,
} from "@/models/workouts";
import { db } from "./firebase";

const workoutsCol = (clubId: string) => collection(db, "clubs", clubId, "workouts");

export function subscribeWorkoutWeek(
  clubId: string,
  monday: string,
  onData: (w: WorkoutWeek | null) => void,
): () => void {
  return onSnapshot(
    doc(db, "clubs", clubId, "workoutWeeks", monday),
    (snap) => onData(snap.exists() ? (snap.data() as WorkoutWeek) : null),
    () => onData(null),
  );
}

/** Mine (members may only query their own). */
export function subscribeMyWorkouts(
  clubId: string,
  uid: string,
  onData: (w: Workout[]) => void,
): () => void {
  return onSnapshot(
    query(workoutsCol(clubId), where("uid", "==", uid)),
    (snap) => onData(snap.docs.map((d) => ({ ...(d.data() as Omit<Workout, "id">), id: d.id }))),
    () => onData([]),
  );
}

/** Everyone's since a date (coaches/admins). */
export function subscribeClubWorkouts(
  clubId: string,
  sinceDate: string,
  onData: (w: Workout[]) => void,
): () => void {
  return onSnapshot(
    query(workoutsCol(clubId), where("date", ">=", sinceDate)),
    (snap) => onData(snap.docs.map((d) => ({ ...(d.data() as Omit<Workout, "id">), id: d.id }))),
    () => onData([]),
  );
}

export async function addWorkout(
  clubId: string,
  w: { uid: string; name: string; kind: WorkoutKind; minutes: number; date: string; note?: string },
): Promise<void> {
  const note = w.note?.trim();
  await setDoc(doc(workoutsCol(clubId)), {
    uid: w.uid,
    name: w.name.slice(0, 100),
    kind: w.kind,
    minutes: Math.max(1, Math.min(WORKOUT_MINUTES_MAX, Math.round(w.minutes))),
    date: w.date,
    ...(note ? { note: note.slice(0, 200) } : {}),
    createdAt: new Date().toISOString(),
  });
}

export async function deleteWorkout(clubId: string, id: string): Promise<void> {
  await deleteDoc(doc(workoutsCol(clubId), id));
}

/**
 * Count recorded ImuaTrak paddles since a date as workouts. Ids are derived
 * from the session, so running this again never double-counts; `existing`
 * (ids already logged) skips the rewrite. Returns how many were added.
 */
export async function importMyPaddles(
  clubId: string,
  uid: string,
  name: string,
  sinceDate: string,
  existing: Set<string>,
): Promise<number> {
  const since = new Date(`${sinceDate}T00:00:00`).toISOString();
  const snap = await getDocs(query(collection(db, "users", uid, "sessions"), where("startedAt", ">=", since)));
  let added = 0;
  for (const d of snap.docs) {
    const s = d.data() as Session;
    const id = paddleWorkoutId(uid, d.id);
    if (existing.has(id)) continue;
    const minutes = Math.round((s.totals?.durationSec ?? 0) / 60);
    if (minutes < 1) continue;
    await setDoc(doc(workoutsCol(clubId), id), {
      uid,
      name: name.slice(0, 100),
      kind: "paddle",
      minutes: Math.min(WORKOUT_MINUTES_MAX, minutes),
      date: localDate(new Date(s.startedAt)),
      sessionId: d.id,
      createdAt: new Date().toISOString(),
    });
    added += 1;
  }
  return added;
}
