"use client";

import { useEffect, useState } from "react";

/**
 * Bounces a visitor from the web invite link into the native app via the
 * `imuatrak://` deep link, and offers a manual button + download fallback
 * for anyone who doesn't have the app installed yet.
 */
export default function OpenInApp({ identifier }: { identifier: string }) {
  const deepLink = `imuatrak://club/join?slug=${encodeURIComponent(identifier)}`;
  const [triedAuto, setTriedAuto] = useState(false);

  // Attempt to open the app automatically on first load. If the app isn't
  // installed nothing happens and the buttons below remain.
  useEffect(() => {
    const t = setTimeout(() => {
      window.location.href = deepLink;
      setTriedAuto(true);
    }, 400);
    return () => clearTimeout(t);
  }, [deepLink]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 28 }}>
      <a className="btn" href={deepLink} style={{ display: "block", textAlign: "center" }}>
        Open in ImuaTrak
      </a>
      <a
        className="btn btn-outline"
        href="https://imuatrak.app/#download"
        style={{ display: "block", textAlign: "center" }}
      >
        Don&apos;t have the app? Get it here
      </a>
      {triedAuto && (
        <p className="muted" style={{ fontSize: 13, textAlign: "center", marginTop: 4 }}>
          Nothing happened? Tap &ldquo;Open in ImuaTrak&rdquo; above, or install
          the app first, then reopen this link.
        </p>
      )}
    </div>
  );
}
