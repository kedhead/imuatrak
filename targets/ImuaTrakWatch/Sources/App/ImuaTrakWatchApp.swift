import SwiftUI

@main
struct ImuaTrakWatchApp: App {
    @StateObject private var workoutManager = WorkoutManager()
    @StateObject private var transferManager = TransferManager.shared
    @StateObject private var authManager = AuthManager.shared
    @StateObject private var syncManager = SyncManager.shared
    @StateObject private var historyStore = HistoryStore()
    @StateObject private var settingsCache = SettingsCache.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(workoutManager)
                .environmentObject(transferManager)
                .environmentObject(authManager)
                .environmentObject(syncManager)
                .environmentObject(historyStore)
                .environmentObject(settingsCache)
        }
    }
}
