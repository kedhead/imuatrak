"use client";

import { useEffect, useState } from "react";

const APP_STORE_URL = "https://apps.apple.com/us/app/imuatrak/id6774396124";

/**
 * Bounces a visitor from the web invite link into the native app via the
 * `imuatrak://` deep link, and offers a download fallback for anyone who
 * doesn't have the app installed yet.
 *
 * The download button copies the invite link to the clipboard first: after
 * installing, the app's join screen finds it there and pre-fills, so the
 * invite survives the trip through the App Store.
 */
export default function OpenInApp({ identifier }: { identifier: string }) {
  const deepLink = `imuatrak://club/join?slug=${encodeURIComponent(identifier)}`;
  const inviteLink = `https://imuatrak.app/join/${encodeURIComponent(identifier)}`;
  const [triedAuto, setTriedAuto] = useState(false);
  const [copied, setCopied] = useState(false);

  // Attempt to open the app automatically on first load. If the app isn't
  // installed nothing happens and the buttons below remain.
  useEffect(() => {
    const t = setTimeout(() => {
      window.location.href = deepLink;
      setTriedAuto(true);
    }, 400);
    return () => clearTimeout(t);
  }, [deepLink]);

  const handleGetApp = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
    } catch {
      // Clipboard blocked — the store link still works, the user just
      // re-taps the invite afterwards.
    }
    window.location.href = APP_STORE_URL;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 28 }}>
      <a className="btn" href={deepLink} style={{ display: "block", textAlign: "center" }}>
        Open in ImuaTrak
      </a>
      <button
        className="btn btn-outline"
        onClick={handleGetApp}
        style={{ display: "block", textAlign: "center", width: "100%", cursor: "pointer" }}
      >
        Don&apos;t have the app? Get it on the App Store
      </button>
      {copied && (
        <p className="muted" style={{ fontSize: 13, textAlign: "center", margin: 0 }}>
          Invite copied — after installing, open ImuaTrak and the invite will be waiting.
        </p>
      )}
      {triedAuto && !copied && (
        <p className="muted" style={{ fontSize: 13, textAlign: "center", marginTop: 4 }}>
          Nothing happened? Tap &ldquo;Open in ImuaTrak&rdquo; above, or install
          the app first, then reopen this link.
        </p>
      )}
    </div>
  );
}
