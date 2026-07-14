import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithCustomToken,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile,
  type User,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { Platform } from "react-native";
import { auth, functions } from "./firebase";

export type AuthUser = User;

export function watchAuth(cb: (u: AuthUser | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

export function currentUser(): AuthUser | null {
  return auth.currentUser;
}

export async function signOut(): Promise<void> {
  await fbSignOut(auth);
}

// ── Guest mode ────────────────────────────────────────────────────────────────
// Recording, history, and stats are all local-first and work without an
// account; only clubs and cross-device sync need sign-in. The flag lets the
// app open straight into the tabs so the core feature is reachable with zero
// friction (users trying the app out — and App Review).

const KEY_GUEST = "imuatrak.guestMode";

export async function isGuestMode(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY_GUEST)) === "1";
  } catch {
    return false;
  }
}

export async function setGuestMode(on: boolean): Promise<void> {
  try {
    if (on) await AsyncStorage.setItem(KEY_GUEST, "1");
    else await AsyncStorage.removeItem(KEY_GUEST);
  } catch {
    // Non-critical — worst case the user sees onboarding again.
  }
}

export const appleSignInAvailable = async (): Promise<boolean> => {
  if (Platform.OS !== "ios") return false;
  return AppleAuthentication.isAvailableAsync();
};

/**
 * Sign in with Apple → Firebase. Generates a nonce, requests an Apple
 * identity token, and exchanges it for a Firebase credential.
 */
export async function signInWithApple(): Promise<AuthUser> {
  if (Platform.OS !== "ios") {
    throw new Error("Sign in with Apple is iOS-only");
  }
  const rawNonce = randomNonce(32);
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });
  if (!credential.identityToken) throw new Error("Apple sign-in returned no identity token");

  // Native Apple tokens have audience = bundle ID ("app.imuatrak"), but
  // Firebase's signInWithCredential now expects Services ID audience
  // ("app.imuatrak.web") because web Apple Sign-In is also configured.
  // We proxy through a Cloud Function that validates the native token against
  // the bundle ID and returns a Firebase custom token instead.
  const fn = httpsCallable<{ idToken: string; rawNonce: string }, { customToken: string }>(
    functions,
    "mobileAppleSignIn",
  );
  // rawNonce lets the function verify the token's nonce claim (anti-replay):
  // it hashes rawNonce with SHA-256 and compares against payload.nonce.
  const { data } = await fn({ idToken: credential.identityToken, rawNonce });
  const { user } = await signInWithCustomToken(auth, data.customToken);

  // Apple returns the user's real name ONLY on the very first authorization
  // (and only if they consent), in credential.fullName. Custom-token sign-in
  // does not carry it, so capture it here and persist to the Firebase profile.
  // Without this, user.displayName stays null and the person shows up as the
  // literal "Member" fallback in clubs.
  if (!user.displayName && credential.fullName) {
    const name = [credential.fullName.givenName, credential.fullName.familyName]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (name) {
      await updateProfile(user, { displayName: name }).catch(() => undefined);
    }
  }
  return user;
}

/**
 * Sign in with a Google access token obtained from expo-auth-session.
 * The caller (onboarding screen) handles the OAuth prompt; this function
 * exchanges the token for a Firebase credential.
 */
export async function signInWithGoogleAccessToken(accessToken: string): Promise<AuthUser> {
  const credential = GoogleAuthProvider.credential(null, accessToken);
  const { user } = await signInWithCredential(auth, credential);
  return user;
}

export async function updateDisplayName(name: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  await updateProfile(user, { displayName: name });
}

export async function deleteAccount(): Promise<void> {
  if (!auth.currentUser) throw new Error("Not signed in");
  const fn = httpsCallable(functions, "deleteAccount");
  await fn({});
  // Auth user is now deleted server-side; sign out locally to clear cached state.
  await fbSignOut(auth).catch(() => undefined);
}

function randomNonce(length: number): string {
  const charset =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._";
  const bytes = Crypto.getRandomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += charset.charAt(bytes[i]! % charset.length);
  return out;
}
