import SwiftUI

struct HomeView: View {
    @EnvironmentObject var session: SessionRecorder
    @EnvironmentObject var auth: AuthService
    @State private var showingRecord = false
    @State private var showingSettings = false

    var body: some View {
        NavigationStack {
            Group {
                if session.sessionStore.sessions.isEmpty {
                    VStack(spacing: 12) {
                        Text("No sessions yet").font(.title2.bold())
                        Text("Tap Record to start your first paddle.")
                            .foregroundStyle(.secondary)
                    }.padding(32)
                } else {
                    List(session.sessionStore.sessions) { stored in
                        NavigationLink(value: stored.id) {
                            SessionRow(stored: stored)
                        }
                    }
                    .navigationDestination(for: String.self) { id in
                        SessionDetailView(sessionId: id)
                    }
                }
            }
            .navigationTitle("Paddleup")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { showingSettings = true } label: { Image(systemName: "gear") }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingRecord = true } label: {
                        Label("Record", systemImage: "play.fill")
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .sheet(isPresented: $showingRecord) {
                RecordView()
                    .interactiveDismissDisabled()
            }
            .sheet(isPresented: $showingSettings) {
                SettingsView()
            }
        }
    }
}

private struct SessionRow: View {
    let stored: StoredSession
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(stored.session.craftType.rawValue) · \(formatKm(stored.session.totals.distanceMeters)) km")
                .font(.headline)
            Text("\(formatDuration(stored.session.totals.durationSec)) · \(stored.session.totals.strokeCount) strokes")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

func formatKm(_ m: Double) -> String { String(format: "%.2f", m / 1000) }

func formatDuration(_ sec: Double) -> String {
    let s = Int(sec)
    return String(format: "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
}

func formatPace(_ secPerKm: Double) -> String {
    guard secPerKm > 0, secPerKm.isFinite else { return "—" }
    let s = Int(secPerKm)
    return String(format: "%d:%02d /km", s / 60, s % 60)
}
