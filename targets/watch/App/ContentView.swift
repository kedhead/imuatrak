import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var workoutManager: WorkoutManager
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            CraftPickerView(path: $path)
                .navigationDestination(for: String.self) { route in
                    switch route {
                    case "pre-record":
                        PreRecordView(path: $path)
                    case "recording":
                        RecordingView(path: $path)
                    case "summary":
                        SummaryView(path: $path)
                    default:
                        CraftPickerView(path: $path)
                    }
                }
        }
        // Navigation is driven by recording state so a workout started from
        // ANY entry point — the in-app Start button or the Siri
        // StartPaddlingIntent — lands on the live recording screen.
        .onChange(of: workoutManager.isRecording) { recording in
            if recording {
                path = NavigationPath(["recording"])
            }
        }
    }
}
