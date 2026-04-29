export function formatKm(m: number): string {
  return (m / 1000).toFixed(2);
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h}:${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

export function formatPace(secPerKm: number): string {
  if (!isFinite(secPerKm) || secPerKm <= 0) return "—";
  const s = Math.floor(secPerKm);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")} /km`;
}
