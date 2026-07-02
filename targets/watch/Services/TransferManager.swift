import Foundation
import WatchConnectivity

// ── TransferManager.swift ─────────────────────────────────────────────────────
// Saves a finished session to the watch's Documents directory and queues
// both files (session.json + track.json) for transfer to the iPhone via
// WCSession.transferFile. Transfers are queued and retried automatically
// by WatchConnectivity even across app restarts.

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

    // ── Save + transfer ───────────────────────────────────────────────────────

    func transferSession(_ ws: WatchSession, fullTrack: [WatchTrackPoint]) async {
        let id = ws.id
        do {
            // Write files to watch Documents/sessions/{id}/
            let dir = try sessionDir(id: id)
            let encoder = JSONEncoder()
            encoder.outputFormatting = .prettyPrinted

            let sessionData = try encoder.encode(ws)
            let trackData = try encoder.encode(fullTrack)
            try sessionData.write(to: dir.appendingPathComponent("session.json"))
            try trackData.write(to: dir.appendingPathComponent("track.json"))

            // Queue transfer to phone
            if session.isReachable || session.activationState == .activated {
                let sessionFile = dir.appendingPathComponent("session.json")
                let trackFile = dir.appendingPathComponent("track.json")
                session.transferFile(sessionFile, metadata: ["id": id, "file": "session"])
                session.transferFile(trackFile, metadata: ["id": id, "file": "track"])
            }

            pendingTransfers.append(id)
        } catch {
            print("[TransferManager] Failed to save/transfer session \(id): \(error)")
        }
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
    }

    nonisolated func session(_ session: WCSession,
                              didFinish fileTransfer: WCSessionFileTransfer,
                              error: Error?) {
        let id = fileTransfer.file.metadata?["id"] as? String ?? ""
        let file = fileTransfer.file.metadata?["file"] as? String ?? ""
        if let error {
            print("[TransferManager] Transfer failed \(id)/\(file): \(error)")
        } else {
            print("[TransferManager] Transfer done \(id)/\(file)")
            // Clean up local files after both files confirmed delivered
            Task { @MainActor in
                self.pendingTransfers.removeAll { $0 == id }
            }
        }
    }
}
