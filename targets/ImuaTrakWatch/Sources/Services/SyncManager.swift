import Foundation
import FirebaseFirestore

// ── SyncManager.swift ─────────────────────────────────────────────────────────
// Routes a finished session to Firebase. Two paths:
//
//  - Standalone (authed + reachable network): write the session doc DIRECTLY to
//    Firestore users/{uid}/sessions/{id}, mirroring the phone's syncSession()
//    write shape. Works over cellular with no phone present. The full-resolution
//    track is still forwarded to the phone (when paired) so the phone builds and
//    uploads the GPX later — "trackSummary now, full GPX when phone is reachable".
//
//  - Fallback (not authed / write didn't confirm): hand off to TransferManager,
//    which queues both files for the phone via WatchConnectivity (durable outbox).
//
// Dedup: the doc id is the session id, so a session synced both directly and via
// the phone converges to one doc (idempotent setData). The watch writes once;
// the phone's forwarded syncSession() merges trackStoragePath on top.

@MainActor
final class SyncManager: ObservableObject {
    static let shared = SyncManager()

    /// Seconds to wait for Firestore to confirm the server write before falling
    /// back to the WCSession outbox. Firestore's completion only fires on server
    /// ack, so a timeout cleanly distinguishes online from offline.
    private let writeTimeout: TimeInterval = 8

    func sync(_ session: WatchSession, fullTrack: [WatchTrackPoint]) async {
        var ws = session

        // Always keep a local copy (history view, deferred GPX, durable outbox).
        try? TransferManager.shared.saveLocally(ws, fullTrack: fullTrack)

        guard let uid = AuthManager.shared.uid else {
            // Not signed in on the watch — tethered path only.
            await TransferManager.shared.transferSession(ws, fullTrack: fullTrack)
            return
        }

        // Firestore create rule requires userId == uid.
        ws.userId = uid

        let didWrite = await writeDirect(ws, uid: uid)
        if didWrite {
            // Doc is in Firestore; forward only the track so the phone can build GPX.
            TransferManager.shared.forwardTrack(id: ws.id)
        } else {
            // Couldn't confirm a server write — queue the full tethered transfer.
            await TransferManager.shared.transferSession(ws, fullTrack: fullTrack)
        }
    }

    /// Returns true only if Firestore confirmed the write within the timeout.
    private func writeDirect(_ ws: WatchSession, uid: String) async -> Bool {
        guard let dict = try? encodeToDictionary(ws) else { return false }
        let ref = Firestore.firestore().document("users/\(uid)/sessions/\(ws.id)")

        return await withCheckedContinuation { continuation in
            var resumed = false
            let resume: (Bool) -> Void = { ok in
                guard !resumed else { return }
                resumed = true
                continuation.resume(returning: ok)
            }

            ref.setData(dict) { error in
                if let error { print("[SyncManager] direct write failed: \(error)") }
                resume(error == nil)
            }

            DispatchQueue.main.asyncAfter(deadline: .now() + writeTimeout) {
                resume(false)
            }
        }
    }

    private func encodeToDictionary(_ ws: WatchSession) throws -> [String: Any] {
        let data = try JSONEncoder().encode(ws)
        let obj = try JSONSerialization.jsonObject(with: data)
        return obj as? [String: Any] ?? [:]
    }
}
