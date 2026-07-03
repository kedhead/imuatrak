import SwiftUI

@main
struct ImuaTrakWatchApp: App {
    @StateObject private var workoutManager = WorkoutManager.shared
    @StateObject private var transferManager = TransferManager.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(workoutManager)
                .environmentObject(transferManager)
        }
    }
}
