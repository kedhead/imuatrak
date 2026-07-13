import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * A club invite that couldn't complete yet (visitor wasn't signed in).
 * Stored so the join resumes automatically right after sign-in instead of
 * making the invitee dig the link out of their chat again.
 */
const KEY = "imuatrak.pendingInvite";

export async function setPendingInvite(identifier: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, identifier);
  } catch {
    // Best-effort — worst case the user re-taps the invite link.
  }
}

export async function takePendingInvite(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v) await AsyncStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}
