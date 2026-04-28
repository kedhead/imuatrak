import Foundation

public enum GpxExporter {

    private static let gpxtpx = "http://www.garmin.com/xmlschemas/TrackPointExtension/v2"
    private static let pu = "http://paddleup.app/xmlschemas/v1"

    public static func toGpx(session: Session, track: [TrackPoint]) -> String {
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime]
        let started = isoFormatter.date(from: session.startedAt) ?? Date()

        var s = ""
        s.reserveCapacity(64 + track.count * 160)
        s += #"<?xml version="1.0" encoding="UTF-8"?>"# + "\n"
        s += #"<gpx version="1.1" creator="Paddleup" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="\#(gpxtpx)" xmlns:pu="\#(pu)">"# + "\n"
        s += "  <metadata>\n"
        s += "    <name>\(escape("Paddleup \(session.craftType.rawValue) session"))</name>\n"
        s += "    <time>\(session.startedAt)</time>\n"
        s += "  </metadata>\n"
        s += "  <trk>\n    <name>\(session.id)</name>\n    <trkseg>\n"

        for p in track {
            let date = started.addingTimeInterval(p.t)
            let tIso = isoFormatter.string(from: date)
            s += "      <trkpt lat=\"\(p.lat)\" lon=\"\(p.lon)\">\n"
            s += "        <ele>\(p.altM)</ele>\n"
            s += "        <time>\(tIso)</time>\n"
            s += "        <extensions>\n"
            if p.hr != nil || p.strokeRate != nil {
                s += "          <gpxtpx:TrackPointExtension>\n"
                if let hr = p.hr { s += "            <gpxtpx:hr>\(hr)</gpxtpx:hr>\n" }
                if let cad = p.strokeRate { s += "            <gpxtpx:cad>\(Int(cad))</gpxtpx:cad>\n" }
                s += "          </gpxtpx:TrackPointExtension>\n"
            }
            s += "          <pu:speed>\(p.speedMps)</pu:speed>\n"
            if let conf = p.cadenceConfidence {
                s += "          <pu:cadConfidence>\(conf)</pu:cadConfidence>\n"
            }
            s += "        </extensions>\n"
            s += "      </trkpt>\n"
        }
        s += "    </trkseg>\n  </trk>\n</gpx>\n"
        return s
    }

    private static func escape(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;")
         .replacingOccurrences(of: "<", with: "&lt;")
         .replacingOccurrences(of: ">", with: "&gt;")
    }
}
