import SwiftUI
import FirebaseCore

@main
struct PaddleupApp: App {
    @StateObject private var session = SessionRecorder()
    @StateObject private var auth = AuthService()

    init() {
        FirebaseApp.configure()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .environmentObject(auth)
        }
    }
}
