"use client";

import dynamic from "next/dynamic";

/**
 * Leaflet touches `window` at import-time, so the actual map component
 * has to be loaded with ssr:false. This wrapper is the one the server
 * page imports — the inner component is browser-only.
 */
const Inner = dynamic(() => import("./SessionMapInner"), { ssr: false });

export default function SessionMap({ points }: { points: [number, number][] }) {
  return <Inner points={points} />;
}
