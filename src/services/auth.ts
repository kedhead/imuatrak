import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithCustomToken,
  signInWithEmailAndPassword,
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

/**
 * Resolve once Firebase has restored the persisted session — or confirmed
 * there isn't one.
 *
 * `auth.currentUser` is null for the first few hundred milliseconds of a cold
 * start while the SDK reads the session back out of AsyncStorage. Anything
 * that runs at launch and branches on "signed in?" must await this instead of
 * reading currentUser() directly, or it sees a signed-in user as signed out.
 * That is exactly what happened to invite links: tapping one from a killed app
 * landed on the join screen before auth had settled and demanded a sign-in the
 * user had already done, so the same link "worked" warm and failed cold.
 */
export function waitForAuth(): Promise<AuthUser | null> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    let unsub: (() => void) | undefined;
    let settled = false;
    unsub = onAuthStateChanged(auth, (user) => {
      settled = true;
      unsub?.();
      resolve(user);
    });
    // onAuthStateChanged can fire synchronously, before `unsub` is assigned.
    if (settled) unsub();
  });
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
 * Sign in with Google tokens obtained from expo-auth-session.
 * The caller (onboarding screen) handles the OAuth prompt; this function
 * exchanges the tokens for a Firebase credential.
 *
 * Firebase prefers the ID token (its audience must be the project's Web
 * client ID — set via webClientId in the auth request). The access token is
 * passed too as a fallback so older flows keep working.
 */
export async function signInWithGoogleTokens(
  idToken: string | null,
  accessToken: string | null,
): Promise<AuthUser> {
  const credential = GoogleAuthProvider.credential(idToken, accessToken);
  const { user } = await signInWithCredential(auth, credential);
  return user;
}

// ── Email / password ──────────────────────────────────────────────────────────
// Requires the Email/Password provider to be enabled in Firebase Console →
// Authentication → Sign-in method.

export async function signInWithEmail(email: string, password: string): Promise<AuthUser> {
  const { user } = await signInWithEmailAndPassword(auth, email.trim(), password);
  return user;
}

export async function signUpWithEmail(
  name: string,
  email: string,
  password: string,
): Promise<AuthUser> {
  const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const displayName = name.trim();
  if (displayName) {
    // Best-effort: the account exists either way, and the /complete-profile
    // gate catches a missing name on next launch.
    await updateProfile(user, { displayName }).catch(() => undefined);
  }
  return user;
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

/**
 * Turn a Firebase Auth error into a message fit for an alert. Unknown codes
 * fall through to the raw message (with the code appended) so real failures
 * stay diagnosable.
 */
export function friendlyAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code;
  switch (code) {
    case "auth/invalid-email":
      return "That email address doesn't look right. Check it and try again.";
    case "auth/email-already-in-use":
      return "An account already exists for that email. Try signing in instead.";
    case "auth/weak-password":
      return "Please choose a stronger password (at least 6 characters).";
    // With email-enumeration protection (the Firebase default), any wrong
    // email/password combination comes back as invalid-credential.
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Email or password is incorrect. Try again, or use “Forgot password?”.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Couldn't reach the sign-in server. Check your internet connection and try again.";
    default: {
      const raw = e instanceof Error ? e.message : String(e);
      return code ? `${raw} (${code})` : raw;
    }
  }
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
