"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signInWithApple, signInWithGoogle, useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  const handleGoogle = async () => {
    setBusy("google");
    setError(null);
    try {
      await signInWithGoogle();
      router.replace("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setBusy(null);
    }
  };

  const handleApple = async () => {
    setBusy("apple");
    setError(null);
    try {
      await signInWithApple();
      router.replace("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setBusy(null);
    }
  };

  if (loading) return null;

  return (
    <main
      style={{
        minHeight: "80vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        className="card"
        style={{ maxWidth: 380, width: "100%", textAlign: "center", padding: 40 }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>Sign in</h1>
        <p style={{ color: "var(--muted)", margin: "0 0 32px", fontSize: 15 }}>
          View and manage all your ImuaTrak sessions on the web.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Apple */}
          <button
            onClick={handleApple}
            disabled={busy !== null}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: "14px 20px",
              borderRadius: 12,
              border: "none",
              background: "#000",
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              cursor: busy !== null ? "default" : "pointer",
              opacity: busy !== null ? 0.6 : 1,
            }}
          >
            <AppleIcon />
            {busy === "apple" ? "Signing in…" : "Continue with Apple"}
          </button>

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={busy !== null}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: "14px 20px",
              borderRadius: 12,
              border: "1px solid var(--line)",
              background: "var(--bg)",
              color: "var(--ink)",
              fontSize: 15,
              fontWeight: 600,
              cursor: busy !== null ? "default" : "pointer",
              opacity: busy !== null ? 0.6 : 1,
            }}
          >
            <GoogleIcon />
            {busy === "google" ? "Signing in…" : "Continue with Google"}
          </button>
        </div>

        {error && (
          <p style={{ color: "#f87171", fontSize: 13, marginTop: 16 }}>{error}</p>
        )}
      </div>
    </main>
  );
}

function AppleIcon() {
  return (
    <svg width="17" height="20" viewBox="0 0 814 1000" fill="currentColor">
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 376.7 0 248.4 0 126.4c0-70.1 25.5-135.5 71.9-183.6C117.9-5.3 180.6-32 248 -32s109.5 38.1 165 38.1c53.3 0 86-38.1 165-38.1s137.5 26.3 183.5 74.6zm-19.3-111.8C726.4 171.4 695 145.1 695 93.7c0-59.3 35.7-104.4 57.3-133.2 25-33.3 60.8-54.7 97.5-54.7 2.6 0 5.1.3 7.6.6-1.3 62.8-25.6 108.5-49.2 139.4-22.2 29.3-58.8 55.4-41.4 55.4z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
