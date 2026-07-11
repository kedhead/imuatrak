import SwiftUI

struct CraftPickerView: View {
    @EnvironmentObject var workoutManager: WorkoutManager
    @Binding var path: NavigationPath

    private let crafts = ["OC1", "OC2", "OC6", "V1", "SUP", "SURFSKI", "DB10", "DB20", "OTHER"]

    var body: some View {
        List(crafts, id: \.self) { craft in
            Button {
                workoutManager.currentCraft = craft
                path.append("pre-record")
            } label: {
                HStack(spacing: 8) {
                    ZStack {
                        Circle()
                            .fill(craftColor(craft).opacity(0.22))
                            .frame(width: 28, height: 28)
                        Image(systemName: "water.waves")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(craftColor(craft))
                    }
                    Text(craft)
                        .font(.system(.headline, design: .rounded))
                    Spacer()
                    if craft == workoutManager.currentCraft {
                        Image(systemName: "checkmark")
                            .font(.caption.bold())
                            .foregroundStyle(craftColor(craft))
                    } else {
                        Image(systemName: "chevron.right")
                            .foregroundStyle(.secondary)
                            .font(.caption)
                    }
                }
            }
        }
        .navigationTitle("Craft")
    }
}
