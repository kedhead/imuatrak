import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import {
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
  const fn = httpsCallable<{ idToken: string }, { customToken: string }>(
    functions,
    "mobileAppleSignIn",
  );
  const { data } = await fn({ idToken: credential.identityToken });
  const { user } = await signInWithCustomToken(auth, data.customToken);
  return user;
}

/**
 * Google sign-in is wired up via expo-auth-session in a follow-up — for
 * Android-first development the placeholder stays here so the UI can show
 * the right button label without crashing.
 */
export async function signInWithGoogle(): Promise<AuthUser> {
  throw new Error("Google sign-in is not wired up yet (Phase 1.5)");
}

export async function updateDisplayName(name: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  await updateProfile(user, { displayName: name });
}

function randomNonce(length: number): string {
  const charset =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._";
  const bytes = Crypto.getRandomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += charset.charAt(bytes[i]! % charset.length);
  return out;
}
