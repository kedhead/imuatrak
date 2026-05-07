"use client";

import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { useEffect, useState } from "react";
import { firebaseApp } from "./firebase";

export type { User };

export const auth = getAuth(firebaseApp);

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const { user } = await signInWithPopup(auth, provider);
  return user;
}

export async function signOut(): Promise<void> {
  await fbSignOut(auth);
}

export function useAuth(): { user: User | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  return { user, loading };
}
