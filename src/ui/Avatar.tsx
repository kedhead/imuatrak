import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import type { MemberRole } from "@/models/club";
import { colors } from "./theme";

/**
 * A member's profile photo, or their initials when they haven't set one.
 *
 * Everyone gets a bubble: Apple Sign In never returns a photo, so an
 * image-only avatar would leave most iOS users blank. Initials fall back to a
 * colour derived from the uid, which keeps two people in the same conversation
 * visually distinct even when their initials collide.
 *
 * Owner/admin/coach override that with their role colour so the roster reads
 * the same way it does elsewhere in the app.
 */

const ROLE_COLOR: Record<MemberRole, string | null> = {
  owner: colors.gold,
  admin: colors.coral,
  coach: colors.teal,
  member: null,
};

// Distinct hues at similar weight, so no member's bubble looks more important
// than another's.
const FALLBACK_COLORS = [
  colors.ocean,
  colors.aqua,
  colors.oceanLight,
  colors.sunset,
  colors.teal,
  colors.mango,
];

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
  /** Colour seed, so a member keeps the same bubble colour as they're renamed. */
  uid: string;
  role?: MemberRole;
  size?: number;
}) {
  // A broken/expired photo URL should degrade to initials rather than render
  // an empty square — avatar URLs carry a download token that rotates on
  // re-upload, so a cached one can go stale.
  const [failed, setFailed] = useState(false);
  const dimensions = { width: size, height: size, borderRadius: size / 2 };

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[styles.image, dimensions]}
        onError={() => setFailed(true)}
        accessibilityLabel={`${name}'s profile photo`}
      />
    );
  }

  return (
    <View
      style={[styles.fallback, dimensions, { backgroundColor: avatarColor(uid, role) }]}
      accessibilityLabel={name}
    >
      <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{initialsOf(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.bg,
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
