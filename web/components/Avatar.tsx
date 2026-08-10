"use client";

import { useState } from "react";
import type { MemberRole } from "@/lib/clubTypes";

/**
 * A member's profile photo, or their initials when they haven't set one.
 *
 * Mirrors src/ui/Avatar.tsx — the fallback colour is derived from the uid the
 * same way, so a member's bubble looks identical in the app and on the web.
 * The initials path is the common one, not an edge case: Apple Sign In never
 * returns a photo.
 */

const ROLE_COLOR: Record<MemberRole, string | null> = {
  owner: "#FFC24B",
  admin: "#FF6B5E",
  coach: "#1FB6A6",
  member: null,
};

const FALLBACK_COLORS = ["#0E5FA5", "#19C3C9", "#2E86C1", "#FF8A4C", "#1FB6A6", "#FFB23E"];

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function avatarColor(seed: string, role?: MemberRole): string {
  const roleColor = role ? ROLE_COLOR[role] : null;
  if (roleColor) return roleColor;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length]!;
}

export function Avatar({
  uri,
  name,
  uid,
  role,
  size = 32,
}: {
  uri?: string;
  name: string;
  /** Colour seed, so a member keeps their bubble colour across renames. */
  uid: string;
  role?: MemberRole;
  size?: number;
}) {
  // Avatar URLs carry a download token that rotates on re-upload, so a cached
  // one can go stale — fall back to initials rather than a broken image.
  const [failed, setFailed] = useState(false);
  const base = {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
  } as const;

  if (uri && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={uri}
        alt={`${name}'s profile photo`}
        onError={() => setFailed(true)}
        style={{ ...base, objectFit: "cover", background: "var(--line)" }}
      />
    );
  }

  return (
    <div
      title={name}
      style={{
        ...base,
        background: avatarColor(uid, role),
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 700,
        lineHeight: 1,
        userSelect: "none",
      }}
    >
      {initialsOf(name)}
    </div>
  );
}
