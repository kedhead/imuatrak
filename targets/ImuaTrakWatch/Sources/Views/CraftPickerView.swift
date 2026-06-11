import SwiftUI

struct CraftPickerView: View {
    @EnvironmentObject var workoutManager: WorkoutManager
    @Binding var path: NavigationPath

    private let crafts = ["OC1", "OC2", "OC6", "V1", "SUP", "SURFSKI", "OTHER"]

    var body: some View {
        List {
            Section {
                ForEach(crafts, id: \.self) { craft in
                    Button {
                        workoutManager.currentCraft = craft
                        path.append("pre-record")
                    } label: {
                        HStack {
                            Text(craft).font(.headline)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .foregroundStyle(.secondary)
                                .font(.caption)
                        }
                    }
                }
            } header: {
                Text("New session")
            }

            Section {
                Button {
                    path.append("history")
                } label: {
                    Label("Recent", systemImage: "list.bullet")
                }
                Button {
                    path.append("goal")
                } label: {
                    Label("This Week", systemImage: "target")
                }
            }
        }
        .navigationTitle("Craft")
    }
}
