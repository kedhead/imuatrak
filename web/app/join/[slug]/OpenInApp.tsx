"use client";

import { useEffect, useState } from "react";

const APP_STORE_URL = "https://apps.apple.com/us/app/imuatrak/id6774396124";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=app.imuatrak";

/**
 * Bounces a visitor from the web invite link into the native app, and offers a
 * download fallback for anyone who doesn't have the app installed yet.
 *
 * IMPORTANT: the app is opened via a hidden iframe, never a top-level
 * navigation. Assigning `window.location` to an unhandled custom scheme makes
 * iOS Safari show "Safari cannot open the page because the address is invalid"
 * — which is exactly what invitees without the app installed were hitting. A
 * hidden iframe launches the app when the scheme is registered and fails
 * silently when it isn't, so the invite page never throws that error.
 *
 * The download button copies the invite link to the clipboard first: after
 * installing, the app's join screen finds it there and pre-fills, so the
 * invite survives the trip through the App Store.
 */
export default function OpenInApp({ identifier }: { identifier: string }) {
  const deepLink = `imuatrak://club/join?slug=${encodeURIComponent(identifier)}`;
  const inviteLink = `https://imuatrak.app/join/${encodeURIComponent(identifier)}`;
  const [copied, setCopied] = useState(false);
  // Store to fall back to. Resolved after mount so the server-rendered markup
  // stays identical for every visitor; defaults to iOS, which is where the
  // link most often lands.
  const [store, setStore] = useState<"ios" | "android">("ios");

  useEffect(() => {
    if (/android/i.test(navigator.userAgent)) setStore("android");
  }, []);

  /**
   * Attempt to open the app via a throwaway hidden iframe. Never touches
   * window.location, so a missing app can't trigger Safari's invalid-address
   * dialog. Installed apps launch; uninstalled ones simply do nothing.
   */
  const launchApp = () => {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.body.appendChild(iframe);
    iframe.src = deepLink;
    setTimeout(() => iframe.remove(), 1500);
  };

  // Best-effort auto-open on first load for visitors who already have the app
  // (e.g. opened from an in-app browser where universal links don't fire).
  useEffect(() => {
    const t = setTimeout(launchApp, 400);
    return () => clearTimeout(t);
    // launchApp only depends on deepLink, which is stable for a given invite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLink]);

  const handleGetApp = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
    } catch {
      // Clipboard blocked — the store link still works, the user just
      // re-taps the invite afterwards.
    }
    window.location.href = store === "android" ? PLAY_STORE_URL : APP_STORE_URL;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 28 }}>
      <button
        className="btn"
        onClick={launchApp}
        style={{ display: "block", textAlign: "center", width: "100%", cursor: "pointer" }}
      >
        Open in ImuaTrak
      </button>
      <button
        className="btn btn-outline"
        onClick={handleGetApp}
        style={{ display: "block", textAlign: "center", width: "100%", cursor: "pointer" }}
      >
        Don&apos;t have the app? Get it on{" "}
        {store === "android" ? "Google Play" : "the App Store"}
      </button>
      {copied && (
        <p className="muted" style={{ fontSize: 13, textAlign: "center", margin: 0 }}>
          Invite copied — after installing, open ImuaTrak and the invite will be waiting.
        </p>
      )}
      <p className="muted" style={{ fontSize: 13, textAlign: "center", marginTop: 4 }}>
        Nothing happened? Tap &ldquo;Open in ImuaTrak&rdquo; above, or install
        the app first, then reopen this link.
      </p>
    </div>
  );
}
