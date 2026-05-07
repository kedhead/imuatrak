"use client";

import { useState } from "react";

export default function ShareButton({ url, title }: { url: string; title: string }) {
  const [label, setLabel] = useState("Share");

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // user cancelled — fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(url);
    setLabel("Copied!");
    setTimeout(() => setLabel("Share"), 2200);
  };

  return (
    <button
      onClick={handleShare}
      className="btn btn-outline"
      style={{ fontSize: 14, padding: "8px 18px", cursor: "pointer" }}
    >
      {label}
    </button>
  );
}
