"use client";

import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { useEffect, useState } from "react";
import { firebaseApp } from "./firebase";

export type { User };

// Never call getAuth() at module level — it accesses browser APIs and will
// throw during Next.js server-side prerendering. Call it lazily inside
// effects and async event handlers (browser-only contexts).
function firebaseAuth() {
  return getAuth(firebaseApp);
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const { user } = await signInWithPopup(firebaseAuth(), provider);
  return user;
}

export async function signInWithApple(): Promise<User> {
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  const { user } = await signInWithPopup(firebaseAuth(), provider);
  return user;
}

// ── Email / password ─────────────────────────────────────────────────────────
// Same provider the mobile app uses, so one account works in both places.

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const { user } = await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);
  return user;
}

export async function signUpWithEmail(
  name: string,
  email: string,
  password: string,
): Promise<User> {
  const { user } = await createUserWithEmailAndPassword(firebaseAuth(), email.trim(), password);
  const displayName = name.trim();
  if (displayName) {
    // Best-effort — the account exists either way, and club rosters fall back
    // to repairing the name from the auth profile on next load.
    await updateProfile(user, { displayName }).catch(() => undefined);
  }
  return user;
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(firebaseAuth(), email.trim());
}

/**
 * Turn a Firebase Auth error into a message worth showing. Unknown codes fall
 * through to the raw message so real failures stay diagnosable. Mirrors
 * friendlyAuthError in the mobile app's src/services/auth.ts.
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
      return "Couldn't reach the sign-in server. Check your connection and try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Sign-in was cancelled.";
    default: {
      const raw = e instanceof Error ? e.message : String(e);
      return code ? `${raw} (${code})` : raw;
    }
  }
}

export async function signOut(): Promise<void> {
  await fbSignOut(firebaseAuth());
}

export function useAuth(): { user: User | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(firebaseAuth(), (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  return { user, loading };
}
