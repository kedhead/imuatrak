import type { Units } from "@/services/settings";

export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDistance(m: number, units: Units): string {
  if (units === "imperial") {
    return `${(m / 1609.344).toFixed(2)} mi`;
  }
  return `${(m / 1000).toFixed(2)} km`;
}

export function formatPaceStr(secPerKm: number, units: Units): string {
  if (!isFinite(secPerKm) || secPerKm <= 0) return "—";
  const sec = units === "imperial" ? secPerKm * 1.60934 : secPerKm;
  const unit = units === "imperial" ? "/mi" : "/km";
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")} ${unit}`;
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h}:${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

/** @deprecated Use formatDistance(m, units) */
export function formatKm(m: number): string {
  return `${(m / 1000).toFixed(2)}`;
}

/** @deprecated Use formatPaceStr(secPerKm, units) */
export function formatPace(secPerKm: number): string {
  if (!isFinite(secPerKm) || secPerKm <= 0) return "—";
  const s = Math.floor(secPerKm);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")} /km`;
}
