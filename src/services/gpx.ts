import type { Session, TrackPoint } from "@/models";

const GPXTPX = "http://www.garmin.com/xmlschemas/TrackPointExtension/v2";
const IT = "http://imuatrak.app/xmlschemas/v1";

/**
 * Generate a GPX 1.1 document for a Session + its full-resolution track.
 * Outputs Garmin-compatible TrackPointExtension v2 elements for HR/cadence
 * and an ImuaTrak-namespaced extension for speed and cadence-confidence.
 */
export function toGpx(session: Session, track: TrackPoint[]): string {
  const startedMs = Date.parse(session.startedAt);
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<gpx version="1.1" creator="ImuaTrak" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="${GPXTPX}" xmlns:it="${IT}">`,
  );
  lines.push("  <metadata>");
  lines.push(`    <name>${escape(`ImuaTrak ${session.craftType} session`)}</name>`);
  lines.push(`    <time>${session.startedAt}</time>`);
  lines.push("  </metadata>");
  lines.push("  <trk>");
  lines.push(`    <name>${session.id}</name>`);
  lines.push("    <trkseg>");

  for (const p of track) {
    const tIso = new Date(startedMs + p.t * 1000).toISOString();
    lines.push(`      <trkpt lat="${p.lat}" lon="${p.lon}">`);
    lines.push(`        <ele>${p.altM}</ele>`);
    lines.push(`        <time>${tIso}</time>`);
    lines.push("        <extensions>");
    if (p.hr != null || p.strokeRate != null) {
      lines.push("          <gpxtpx:TrackPointExtension>");
      if (p.hr != null) lines.push(`            <gpxtpx:hr>${p.hr}</gpxtpx:hr>`);
      if (p.strokeRate != null)
        lines.push(`            <gpxtpx:cad>${Math.round(p.strokeRate)}</gpxtpx:cad>`);
      lines.push("          </gpxtpx:TrackPointExtension>");
    }
    lines.push(`          <it:speed>${p.speedMps}</it:speed>`);
    if (p.cadenceConfidence != null) {
      lines.push(`          <it:cadConfidence>${p.cadenceConfidence}</it:cadConfidence>`);
    }
    lines.push("        </extensions>");
    lines.push("      </trkpt>");
  }

  lines.push("    </trkseg>");
  lines.push("  </trk>");
  lines.push("</gpx>");
  return lines.join("\n") + "\n";
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
