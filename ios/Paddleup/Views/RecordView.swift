import SwiftUI
import PaddleupShared

struct RecordView: View {
    @EnvironmentObject var session: SessionRecorder
    @EnvironmentObject var auth: AuthService
    @Environment(\.dismiss) private var dismiss

    @State private var craft: CraftType = .OC1
    @State private var saving = false

    var body: some View {
        VStack {
            HStack {
                Picker("Craft", selection: $craft) {
                    ForEach(CraftType.allCases, id: \.self) { t in
                        Text(t.rawValue).tag(t)
                    }
                }
                .pickerStyle(.segmented)
                .disabled(session.live.isRecording)
            }
            .padding()

            Spacer()

            VStack(alignment: .leading, spacing: 24) {
                metric("Distance", value: "\(formatKm(session.live.distanceMeters)) km")
                metric("Time", value: formatDuration(session.live.durationSec))
                metric("Pace",
                       value: session.live.currentSpeedMps > 0
                           ? formatPace(1000 / session.live.currentSpeedMps)
                           : "—")
                metric("Stroke rate",
                       value: session.live.currentStrokeRate > 0
                           ? "\(Int(session.live.currentStrokeRate)) spm"
                           : "—")
                metric("Strokes", value: "\(session.live.strokeCount)")
            }
            .padding(.horizontal, 32)

            Spacer()

            HStack(spacing: 12) {
                if session.live.isRecording {
                    Button(role: .destructive) {
                        session.discard(); dismiss()
                    } label: { Text("Discard").frame(maxWidth: .infinity) }
                        .buttonStyle(.bordered).controlSize(.large)

                    Button {
                        Task { await stopAndSave() }
                    } label: { Text("Stop & save").frame(maxWidth: .infinity) }
                        .buttonStyle(.borderedProminent).controlSize(.large)
                        .disabled(saving)
                } else {
                    Button {
                        session.start(craft: craft)
                    } label: { Text("Start").frame(maxWidth: .infinity) }
                        .buttonStyle(.borderedProminent).controlSize(.large)
                }
            }
            .padding()
        }
    }

    @ViewBuilder
    private func metric(_ label: String, value: String) -> some View {
        HStack {
            Text(label).font(.body).foregroundStyle(.secondary)
            Spacer()
            Text(value).font(.title.monospacedDigit())
        }
    }

    private func stopAndSave() async {
        guard let uid = auth.user?.uid else { return }
        saving = true
        defer { saving = false }
        _ = await session.stopAndSave(uid: uid)
        dismiss()
    }
}
