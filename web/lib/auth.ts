"use client";

import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
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
