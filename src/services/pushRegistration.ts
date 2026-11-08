import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as Updates from "expo-updates";
import { doc, setDoc } from "firebase/firestore";
import { Platform } from "react-native";
import { create } from "zustand";
import { registerFcmToken } from "./clubService";
import { db } from "./firebase";

/**
 * Why this device can or can't receive pushes, as last observed.
 *
 * - registered: permission granted and an Expo token stored on the account.
 * - denied: the user (or Android 13+'s default) said no. Only system settings
 *   can change it once `canAskAgain` is false.
 * - undetermined: never asked (we only prompt at sign-in).
 * - error: permission granted but no token. On Android this is what a binary
 *   built without google-services.json does — every build before 2026-09-19 —
 *   and no OTA can fix it; the user has to update from the Play Store.
 */
export type PushState = "registered" | "denied" | "undetermined" | "error";

export interface PushStatus {
  state: PushState;
  platform: "ios" | "android";
  canAskAgain: boolean;
  error?: string;
  /** Store version and build of the installed binary — what tells an old,
   *  push-incapable Android build apart from a current one. */
  appVersion: string | null;
  appBuild: string | null;
  runtimeVersion: string | null;
  updatedAt: string;
}

/** Live status for the Settings row. */
export const usePushStatus = create<{ status: PushStatus | null }>(() => ({ status: null }));

let lastWritten: string | null = null;
let inFlight: Promise<PushStatus> | null = null;

/**
 * Register this device for pushes and record the outcome on users/{uid}.
 *
 * `prompt` shows the OS permission dialog when it still can; foreground and
 * token-rotation re-checks pass false so they never nag. Safe to call often:
 * concurrent calls share one run, and the Firestore write only happens when
 * the status actually changed.
 *
 * The record (`pushStatus` on the user doc) exists so "some Android users
 * don't get notifications" is answerable per person — permission off vs. an
 * old build vs. a registration error — instead of guesswork.
 */
export function registerPush(uid: string, { prompt }: { prompt: boolean }): Promise<PushStatus> {
  inFlight ??= run(uid, prompt).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(uid: string, prompt: boolean): Promise<PushStatus> {
  const platform = Platform.OS === "ios" ? "ios" : "android";
  const base = {
    platform,
    appVersion: Application.nativeApplicationVersion ?? null,
    appBuild: Application.nativeBuildVersion ?? null,
    runtimeVersion: Updates.runtimeVersion ?? null,
  } as const;

  let status: PushStatus;
  try {
    let perm = await Notifications.getPermissionsAsync();
    if (perm.status !== "granted" && prompt && perm.canAskAgain) {
      perm = await Notifications.requestPermissionsAsync();
    }
    if (perm.status !== "granted") {
      status = {
        ...base,
        state: perm.status === "denied" ? "denied" : "undetermined",
        canAskAgain: perm.canAskAgain,
        updatedAt: new Date().toISOString(),
      };
    } else {
      // An EXPO push token, not getDevicePushTokenAsync(): Expo's push service
      // routes APNs/FCM from this one token type (see docs/push-notifications.md).
      const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
      const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
      await registerFcmToken(uid, token.data, platform);
      status = { ...base, state: "registered", canAskAgain: true, updatedAt: new Date().toISOString() };
    }
  } catch (e) {
    // Never block the app on push, but never be silent about it either.
    const message = e instanceof Error ? e.message : String(e);
    console.warn("[push] token registration failed:", e);
    status = {
      ...base,
      state: "error",
      canAskAgain: false,
      error: message.slice(0, 300),
      updatedAt: new Date().toISOString(),
    };
  }

  usePushStatus.setState({ status });

  // Only write when something meaningful changed (not just the timestamp), so
  // foreground re-checks don't cost a write every time the app opens.
  const key = `${uid}:${JSON.stringify({ ...status, updatedAt: undefined })}`;
  if (key !== lastWritten) {
    try {
      await setDoc(doc(db, "users", uid), { pushStatus: status }, { merge: true });
      lastWritten = key;
    } catch (e) {
      console.warn("[push] could not record push status:", e);
    }
  }
  return status;
}

/** Forget cached state on sign-out so the next account records its own. */
export function resetPushStatus(): void {
  lastWritten = null;
  usePushStatus.setState({ status: null });
}
