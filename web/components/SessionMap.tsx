"use client";

import dynamic from "next/dynamic";

const Inner = dynamic(() => import("./SessionMapInner"), { ssr: false });

export default function SessionMap({ points }: { points: [number, number][] }) {
  return <Inner points={points} />;
}
