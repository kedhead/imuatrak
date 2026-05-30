/**
 * ImuaTrak design system — "ocean / island energy".
 *
 * Everything here is additive and backward compatible: the original
 * `colors.blue / teal / sand / ink / muted / bg / card / danger` keys still
 * resolve exactly as before, so existing screens keep working while new screens
 * adopt the richer palette, gradients, typography and shadow tokens.
 */

export const colors = {
  // ── Original keys (kept for backward compatibility) ──────────────────────
  blue: "#0E5FA5",
  teal: "#1FB6A6",
  sand: "#F4ECD8",
  ink: "#0B1E2D",
  muted: "#6B7785",
  bg: "#ECEFF3",
  card: "#FFFFFF",
  danger: "#E5484D",

  // ── Ocean palette ────────────────────────────────────────────────────────
  oceanDeep: "#07314F",
  ocean: "#0E5FA5",
  oceanLight: "#2E86C1",
  aqua: "#19C3C9",
  seafoam: "#7BE0CF",

  // ── Warm sunrise / sunset accents ────────────────────────────────────────
  coral: "#FF6B5E",
  sunset: "#FF8A4C",
  gold: "#FFC24B",
  mango: "#FFB23E",

  // ── Neutrals & support ───────────────────────────────────────────────────
  sandLight: "#FBF6E9",
  inkSoft: "#1C3A4F",
  line: "#E3E7EC",
  white: "#FFFFFF",
  bgSoft: "#F4F8FB",

  // ── Semantic aliases ─────────────────────────────────────────────────────
  primary: "#0E5FA5",
  accent: "#FF6B5E",
  success: "#1FB6A6",
} as const;

/**
 * Gradient stop arrays for use with <Gradient> / expo-linear-gradient.
 * Default direction is diagonal (top-left → bottom-right) for energy.
 */
export const gradients = {
  ocean: ["#1573C4", "#0E5FA5", "#07314F"],
  sunrise: ["#FFC24B", "#FF8A4C", "#FF6B5E"],
  aqua: ["#3BD6DB", "#19C3C9", "#1FB6A6"],
  seafoam: ["#9BEBD9", "#7BE0CF", "#1FB6A6"],
  night: ["#0E5FA5", "#07314F", "#0B1E2D"],
  sand: ["#FBF6E9", "#F4ECD8"],
  coral: ["#FF8A4C", "#FF6B5E"],
} as const;

export type GradientName = keyof typeof gradients;

/** Typography scale. Uses the system font with strong weights for impact. */
export const type = {
  size: {
    xs: 12,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    display: 32,
    hero: 42,
  },
  weight: {
    regular: "400" as const,
    medium: "600" as const,
    bold: "700" as const,
    heavy: "800" as const,
  },
  spacing: {
    tight: -0.5,
    normal: 0,
    wide: 0.5,
    label: 1.2,
  },
  /** Spread onto numeric <Text> for aligned tabular figures. */
  mono: { fontVariant: ["tabular-nums"] as ["tabular-nums"] },
} as const;

/** Elevation presets — spread directly onto a style object. */
export const shadow = {
  sm: {
    shadowColor: "#0B1E2D",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  md: {
    shadowColor: "#0B1E2D",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  lg: {
    shadowColor: "#07314F",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  glowCoral: {
    shadowColor: "#FF6B5E",
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  glowAqua: {
    shadowColor: "#19C3C9",
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
} as const;

export const radii = { sm: 8, md: 12, lg: 16, xl: 22, xxl: 28, pill: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Per-craft accent colors so cards & chips read at a glance. */
export const craftColors: Record<string, string> = {
  OC1: colors.aqua,
  OC2: colors.oceanLight,
  OC6: colors.ocean,
  V1: colors.seafoam,
  SUP: colors.gold,
  SURFSKI: colors.coral,
  OTHER: colors.muted,
};

export function craftColor(craft: string): string {
  return craftColors[craft] ?? colors.ocean;
}
