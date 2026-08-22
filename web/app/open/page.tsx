"use client";

import { useEffect, useState } from "react";

const APP_STORE_URL = "https://apps.apple.com/us/app/imuatrak/id6774396124";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=app.imuatrak";
const WEB_APP_URL = "https://imuatrak.app/dashboard/club";
// Bare custom scheme opens the app to its entry, which lands members on the
// Club tab. No universal-link path config is needed for the custom scheme, so
// this works on both platforms without an app rebuild.
const APP_DEEP_LINK = "imuatrak://";

/**
 * Smart "open ImuaTrak" link for the team website.
 *
 *  - On a phone: launches the app (App Store / Play Store fallback if missing).
 *  - On a computer: redirects to the ImuaTrak web app.
 *
 * The app is launched via a hidden iframe, never a top-level navigation:
 * assigning window.location to an unregistered custom scheme makes iOS Safari
 * throw "the address is invalid". A hidden iframe launches an installed app and
 * fails silently otherwise (same technique as the invite page's OpenInApp).
 */
export default function OpenPage() {
  const [mode, setMode] = useState<"checking" | "mobile" | "desktop">("checking");
  const [store, setStore] = useState<"ios" | "android">("ios");

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const isAndroid = /android/i.test(ua);
    const isIOS = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
    const isMobile = isAndroid || isIOS || /Mobile/i.test(ua);
    if (isAndroid) setStore("android");

    if (!isMobile) {
      window.location.replace(WEB_APP_URL);
      setMode("desktop");
      return;
    }
    setMode("mobile");
    launchApp();
  }, []);

  const launchApp = () => {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.body.appendChild(iframe);
    iframe.src = APP_DEEP_LINK;
    setTimeout(() => iframe.remove(), 1500);
  };

  if (mode === "desktop" || mode === "checking") {
    return (
      <main className="container" style={wrap}>
        <p style={{ color: "var(--muted)", fontSize: 16 }}>Opening ImuaTrak…</p>
        <a href={WEB_APP_URL} style={primaryBtn}>Continue to the web app</a>
      </main>
    );
  }

  return (
    <main className="container" style={wrap}>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px" }}>Open ImuaTrak</h1>
      <p style={{ color: "var(--muted)", fontSize: 15, margin: "0 0 24px", textAlign: "center" }}>
        Tap below to open the app. Don&apos;t have it yet? Grab it from your app store.
      </p>

      <button onClick={launchApp} style={primaryBtn}>Open the app</button>

      <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>Don&apos;t have the app?</span>
        {store === "android" ? (
          <a href={PLAY_STORE_URL} style={storeBtn}>Get it on Google Play</a>
        ) : (
          <a href={APP_STORE_URL} style={storeBtn}>Download on the App Store</a>
        )}
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "70vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 16,
  paddingTop: 40,
};
const primaryBtn: React.CSSProperties = {
  background: "var(--blue-bright)",
  color: "#fff",
  border: "none",
  borderRadius: 12,
  padding: "14px 28px",
  fontWeight: 700,
  fontSize: 16,
  cursor: "pointer",
  textDecoration: "none",
};
const storeBtn: React.CSSProperties = {
  background: "var(--ink)",
  color: "#fff",
  borderRadius: 10,
  padding: "10px 20px",
  fontWeight: 700,
  fontSize: 14,
  textDecoration: "none",
};
