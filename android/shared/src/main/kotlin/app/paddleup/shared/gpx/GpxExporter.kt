package app.paddleup.shared.gpx

import app.paddleup.shared.model.Session
import app.paddleup.shared.model.TrackPoint
import kotlinx.datetime.Instant
import kotlin.time.Duration.Companion.seconds

/**
 * Generates a GPX 1.1 document for a [Session] + its full-resolution track.
 *
 * Outputs Garmin-compatible TrackPointExtension v2 elements for HR and cadence,
 * and a Paddleup-namespaced extension for speed and cadence-confidence.
 */
object GpxExporter {

    private const val GPXTPX = "http://www.garmin.com/xmlschemas/TrackPointExtension/v2"
    private const val PU = "http://paddleup.app/xmlschemas/v1"

    fun toGpx(session: Session, track: List<TrackPoint>): String {
        val started = Instant.parse(session.startedAt)
        val sb = StringBuilder(64 + track.size * 160)
        sb.append("""<?xml version="1.0" encoding="UTF-8"?>""").append('\n')
        sb.append(
            """<gpx version="1.1" creator="Paddleup"
              | xmlns="http://www.topografix.com/GPX/1/1"
              | xmlns:gpxtpx="$GPXTPX"
              | xmlns:pu="$PU">""".trimMargin().replace("\n", " "),
        ).append('\n')

        sb.append("  <metadata>\n")
        sb.append("    <name>").append(escape("Paddleup ${session.craftType.name} session")).append("</name>\n")
        sb.append("    <time>").append(session.startedAt).append("</time>\n")
        sb.append("  </metadata>\n")

        sb.append("  <trk>\n    <name>").append(session.id).append("</name>\n    <trkseg>\n")
        for (p in track) {
            val tIso = started.plus(p.t.seconds).toString()
            sb.append("      <trkpt lat=\"").append(p.lat).append("\" lon=\"").append(p.lon).append("\">\n")
            sb.append("        <ele>").append(p.altM).append("</ele>\n")
            sb.append("        <time>").append(tIso).append("</time>\n")
            sb.append("        <extensions>\n")
            if (p.hr != null || p.strokeRate != null) {
                sb.append("          <gpxtpx:TrackPointExtension>\n")
                p.hr?.let { sb.append("            <gpxtpx:hr>").append(it).append("</gpxtpx:hr>\n") }
                p.strokeRate?.let { sb.append("            <gpxtpx:cad>").append(it.toInt()).append("</gpxtpx:cad>\n") }
                sb.append("          </gpxtpx:TrackPointExtension>\n")
            }
            sb.append("          <pu:speed>").append(p.speedMps).append("</pu:speed>\n")
            p.cadenceConfidence?.let {
                sb.append("          <pu:cadConfidence>").append(it).append("</pu:cadConfidence>\n")
            }
            sb.append("        </extensions>\n")
            sb.append("      </trkpt>\n")
        }
        sb.append("    </trkseg>\n  </trk>\n</gpx>\n")
        return sb.toString()
    }

    private fun escape(s: String): String =
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
}
