import Foundation
import FirebaseCore

// ── FunctionsConfig.swift ─────────────────────────────────────────────────────
// Centralises the Cloud Functions base URL so callers stop hardcoding the
// Firebase project id. The project id comes from the GoogleService-Info.plist
// bundled in the watch target (read via FirebaseApp), matching the phone's
// EXPO_PUBLIC_FIREBASE_PROJECT_ID.

enum FunctionsConfig {
    static let region = "us-central1"

    static var projectId: String {
        FirebaseApp.app()?.options.projectID ?? "stub"
    }

    static func url(for name: String) -> URL {
        URL(string: "https://\(region)-\(projectId).cloudfunctions.net/\(name)")!
    }
}
