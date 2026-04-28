import SwiftUI

struct SessionDetailView: View {
    let sessionId: String
    @EnvironmentObject var session: SessionRecorder
    @State private var shareURL: URL?

    var body: some View {
        let stored = session.sessionStore.load(id: sessionId)
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let s = stored?.session {
                    stat("Distance", "\(formatKm(s.totals.distanceMeters)) km")
                    stat("Duration", formatDuration(s.totals.durationSec))
                    stat("Avg pace", formatPace(s.totals.avgPaceSecPerKm))
                    stat("Strokes", "\(s.totals.strokeCount) (avg \(Int(s.totals.avgStrokeRate)) spm)")
                    stat("Avg HR", s.hr.avg > 0 ? "\(s.hr.avg) bpm" : "—")
                    stat("Elev. gain", "\(Int(s.totals.elevationGainM)) m")

                    Button {
                        shareURL = session.sessionStore.gpxURL(for: s.id)
                    } label: {
                        Label("Export GPX", systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .padding(.top)
                } else {
                    Text("Session not found").foregroundStyle(.secondary)
                }
            }
            .padding()
        }
        .navigationTitle(stored?.session.craftType.rawValue ?? "Session")
        .sheet(item: $shareURL) { url in
            ShareSheet(items: [url])
        }
    }

    @ViewBuilder
    private func stat(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value).font(.title3.monospacedDigit())
        }
    }
}

private struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

extension URL: @retroactive Identifiable {
    public var id: String { absoluteString }
}
