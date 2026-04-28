import FirebaseAuth
import FirebaseFirestore
import FirebaseStorage
import Foundation
import PaddleupShared

@MainActor
final class FirebaseSync {

    /// Uploads a finished session document and its GPX track. Idempotent —
    /// safe to retry on the same id.
    func sync(session: Session, gpxData: Data) async throws {
        guard let uid = Auth.auth().currentUser?.uid else { throw SyncError.notSignedIn }

        // 1) Upload GPX to Storage
        let path = "users/\(uid)/tracks/\(session.id).gpx"
        let ref = Storage.storage().reference(withPath: path)
        let meta = StorageMetadata(); meta.contentType = "application/gpx+xml"
        _ = try await ref.putDataAsync(gpxData, metadata: meta)

        // 2) Write Firestore session doc with the storage path attached
        var doc = session
        doc.trackStoragePath = path
        let data = try JSONEncoder.iso8601.encode(doc)
        let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        try await Firestore.firestore()
            .collection("users").document(uid)
            .collection("sessions").document(session.id)
            .setData(dict)
    }

    enum SyncError: Error { case notSignedIn }
}

private extension JSONEncoder {
    static let iso8601: JSONEncoder = {
        let e = JSONEncoder(); e.dateEncodingStrategy = .iso8601; return e
    }()
}
