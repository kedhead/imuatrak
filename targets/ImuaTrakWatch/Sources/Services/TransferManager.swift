import Foundation
import WatchConnectivity

// ── TransferManager.swift ─────────────────────────────────────────────────────
// Owns the WCSession on the watch. Responsibilities:
//  - Persist a finished session to Documents/sessions/{id}/ (session.json + track.json)
//  - Queue file transfers to the iPhone (tethered sync fallback / deferred GPX)
//  - Receive application-context / messages FROM the phone (auth custom token,
//    weekly-goal settings) and route them to AuthManager / SettingsCache.
// Transfers are queued and retried automatically by WatchConnectivity, even
// across app restarts, so this doubles as a durable outbox.

@MainActor
final class TransferManager: NSObject, ObservableObject {
    static let shared = TransferManager()

    @Published var pendingTransfers: [String] = []   // session IDs waiting for phone

    private let session: WCSession

    override init() {
        session = .default
        super.init()
        if WCSession.isSupported() {
            session.delegate = self
            session.activate()
        }
    }

    // ── Local persistence ───────────────────────────────────────────────────────

    /// Write session.json + track.json to Documents/sessions/{id}/ and return the dir.
    @discardableResult
    func saveLocally(_ ws: WatchSession, fullTrack: [WatchTrackPoint]) throws -> URL {
        let dir = try sessionDir(id: ws.id)
        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted
        try encoder.encode(ws).write(to: dir.appendingPathComponent("session.json"))
        try encoder.encode(fullTrack).write(to: dir.appendingPathComponent("track.json"))
        return dir
    }

    // ── Transfer to phone ───────────────────────────────────────────────────────

    /// Full tethered path: save locally and queue BOTH files for the phone.
    func transferSession(_ ws: WatchSession, fullTrack: [WatchTrackPoint]) async {
        do {
            let dir = try saveLocally(ws, fullTrack: fullTrack)
            queueFile(dir.appendingPathComponent("session.json"), id: ws.id, kind: "session")
            queueFile(dir.appendingPathComponent("track.json"), id: ws.id, kind: "track")
            pendingTransfers.append(ws.id)
        } catch {
            print("[TransferManager] Failed to save/transfer session \(ws.id): \(error)")
        }
    }

    /// Forward only the full-resolution track so the phone can build + upload the
    /// GPX after the watch has already synced the doc directly to Firestore.
    func forwardTrack(id: String) {
        let file = (try? sessionDir(id: id))?.appendingPathComponent("track.json")
        guard let file, FileManager.default.fileExists(atPath: file.path) else { return }
        queueFile(file, id: id, kind: "track")
    }

    private func queueFile(_ url: URL, id: String, kind: String) {
        guard session.activationState == .activated else { return }
        session.transferFile(url, metadata: ["id": id, "file": kind])
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private func sessionDir(id: String) throws -> URL {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = docs.appendingPathComponent("sessions/\(id)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }
}

// ── WCSessionDelegate ─────────────────────────────────────────────────────────

extension TransferManager: WCSessionDelegate {
    nonisolated func session(_ session: WCSession,
                              activationDidCompleteWith activationState: WCSessionActivationState,
                              error: Error?) {
        if let error { print("[TransferManager] WCSession activation error: \(error)") }
        // If we woke up unauthenticated but the phone is reachable, ask for a token.
        Task { @MainActor in
            if AuthManager.shared.uid == nil, session.isReachable {
                session.sendMessage(["type": "requestAuth"], replyHandler: nil, errorHandler: nil)
            }
        }
    }

    nonisolated func session(_ session: WCSession,
                              didFinish fileTransfer: WCSessionFileTransfer,
                              error: Error?) {
        let id = fileTransfer.file.metadata?["id"] as? String ?? ""
        if let error {
            print("[TransferManager] Transfer failed \(id): \(error)")
        } else {
            Task { @MainActor in self.pendingTransfers.removeAll { $0 == id } }
        }
    }

    // Inbound payloads from the phone (auth token, settings).
    nonisolated func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        Self.handleInbound(context)
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        Self.handleInbound(message)
    }

    private static func handleInbound(_ payload: [String: Any]) {
        guard let type = payload["type"] as? String else { return }
        Task { @MainActor in
            switch type {
            case "auth":
                if let token = payload["customToken"] as? String {
                    await AuthManager.shared.signIn(withCustomToken: token)
                }
            case "settings":
                SettingsCache.shared.update(from: payload)
            default:
                break
            }
        }
    }
}
