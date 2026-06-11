import SwiftUI

// ── HistoryView.swift ─────────────────────────────────────────────────────────
// Recent sessions list (read-only glance). Reads via HistoryStore, which uses
// Firestore when authed and local files otherwise.

struct HistoryView: View {
    @EnvironmentObject var history: HistoryStore

    var body: some View {
        Group {
            if history.loading && history.recent.isEmpty {
                ProgressView()
            } else if history.recent.isEmpty {
                ContentUnavailableLabel()
            } else {
                List(history.recent, id: \.id) { s in
                    HistoryRow(session: s)
                }
            }
        }
        .navigationTitle("Recent")
        .task { await history.refresh() }
    }
}

private struct HistoryRow: View {
    let session: WatchSession

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(session.craftType).font(.headline)
                Spacer()
                Text(dateLabel).font(.caption2).foregroundStyle(.secondary)
            }
            HStack(spacing: 10) {
                Label(String(format: "%.2f km", session.totals.distanceMeters / 1000),
                      systemImage: "ruler")
                Label(durationLabel, systemImage: "clock")
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }

    private var dateLabel: String {
        guard let d = ISO8601DateFormatter().date(from: session.startedAt) else { return "" }
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return f.string(from: d)
    }

    private var durationLabel: String {
        let s = Int(session.totals.durationSec)
        let h = s / 3600, m = (s % 3600) / 60
        return h > 0 ? "\(h)h \(m)m" : "\(m)m"
    }
}

private struct ContentUnavailableLabel: View {
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "figure.outdoor.cycle").font(.title2).foregroundStyle(.secondary)
            Text("No sessions yet").font(.caption).foregroundStyle(.secondary)
        }
    }
}
