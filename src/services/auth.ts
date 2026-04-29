import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import {
  OAuthProvider,
  signInWithCredential,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { Platform } from "react-native";
import { auth } from "./firebase";

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

  const provider = new OAuthProvider("apple.com");
  const fbCred = provider.credential({
    idToken: credential.identityToken,
    rawNonce,
  });
  const { user } = await signInWithCredential(auth, fbCred);
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

function randomNonce(length: number): string {
  const charset =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._";
  const bytes = Crypto.getRandomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += charset.charAt(bytes[i]! % charset.length);
  return out;
}
