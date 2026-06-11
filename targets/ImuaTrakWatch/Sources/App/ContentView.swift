import SwiftUI

struct ContentView: View {
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
                    case "history":
                        HistoryView()
                    case "goal":
                        GoalView()
                    default:
                        CraftPickerView(path: $path)
                    }
                }
        }
    }
}
