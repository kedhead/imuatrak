import Foundation
import PaddleupShared

/// File-backed session store. Each finished session is written as a JSON
/// document plus a GPX file under Documents/sessions/{id}/. This keeps the
/// scaffolding free of Core Data while still being durable; we'll migrate to
/// Core Data when we add background sync and editing.
struct StoredSession: Codable, Identifiable {
    let session: Session
    let track: [TrackPoint]
    var synced: Bool

    var id: String { session.id }
}

@MainActor
final class SessionStore: ObservableObject {

    @Published private(set) var sessions: [StoredSession] = []

    private let fm = FileManager.default
    private let root: URL

    init() {
        let docs = try! fm.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        root = docs.appendingPathComponent("sessions", isDirectory: true)
        try? fm.createDirectory(at: root, withIntermediateDirectories: true)
        reload()
    }

    func save(session: Session, track: [TrackPoint]) throws {
        let dir = root.appendingPathComponent(session.id, isDirectory: true)
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)

        let json = try JSONEncoder.iso8601.encode(session)
        try json.write(to: dir.appendingPathComponent("session.json"))

        let track = track
        let trackData = try JSONEncoder.iso8601.encode(track)
        try trackData.write(to: dir.appendingPathComponent("track.json"))

        let gpx = GpxExporter.toGpx(session: session, track: track)
        try gpx.data(using: .utf8)!.write(to: dir.appendingPathComponent("track.gpx"))

        reload()
    }

    func load(id: String) -> StoredSession? {
        sessions.first { $0.id == id }
    }

    func gpxURL(for id: String) -> URL? {
        let url = root.appendingPathComponent(id, isDirectory: true).appendingPathComponent("track.gpx")
        return fm.fileExists(atPath: url.path) ? url : nil
    }

    private func reload() {
        let dec = JSONDecoder.iso8601
        var loaded: [StoredSession] = []
        let dirs = (try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        for dir in dirs where (try? dir.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true {
            guard
                let sj = try? Data(contentsOf: dir.appendingPathComponent("session.json")),
                let session = try? dec.decode(Session.self, from: sj),
                let tj = try? Data(contentsOf: dir.appendingPathComponent("track.json")),
                let track = try? dec.decode([TrackPoint].self, from: tj)
            else { continue }
            loaded.append(StoredSession(session: session, track: track, synced: false))
        }
        sessions = loaded.sorted { $0.session.startedAt > $1.session.startedAt }
    }
}

private extension JSONEncoder {
    static let iso8601: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()
}

private extension JSONDecoder {
    static let iso8601: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
