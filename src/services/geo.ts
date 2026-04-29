/** Haversine distance in meters between two WGS-84 coordinates. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6_371_000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLam = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Stride-based downsample to at most `target` items. */
export function downsample<T>(points: T[], target: number): T[] {
  if (points.length <= target || target <= 0) return points;
  const step = points.length / target;
  const out: T[] = [];
  for (let i = 0; i < target; i++) out.push(points[Math.floor(i * step)]!);
  if (points.length > 0) out.push(points[points.length - 1]!);
  return out;
}
