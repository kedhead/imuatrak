import Foundation
import FirebaseFirestore

// ── HistoryStore.swift ────────────────────────────────────────────────────────
// Backs the recent-sessions list and the weekly-goal glance. When signed in it
// reads the last N sessions from Firestore (works standalone over cellular);
// otherwise it falls back to the sessions stored locally on the watch, so the
// views still render for a tethered-only user who never set up watch auth.

@MainActor
final class HistoryStore: ObservableObject {
    @Published var recent: [WatchSession] = []
    @Published var loading = false

    private let limit = 10

    func refresh() async {
        loading = true
        defer { loading = false }

        if let uid = AuthManager.shared.uid {
            do {
                let snap = try await Firestore.firestore()
                    .collection("users/\(uid)/sessions")
                    .order(by: "startedAt", descending: true)
                    .limit(to: limit)
                    .getDocuments()
                recent = snap.documents.compactMap { try? $0.data(as: WatchSession.self) }
                return
            } catch {
                print("[HistoryStore] Firestore read failed, using local: \(error)")
            }
        }
        recent = loadLocal()
    }

    // ── Weekly totals (mirrors app/(tabs)/index.tsx) ────────────────────────────

    var weekDistanceKm: Double {
        thisWeek().reduce(0) { $0 + $1.totals.distanceMeters / 1000 }
    }

    var weekDurationMin: Double {
        thisWeek().reduce(0) { $0 + $1.totals.durationSec / 60 }
    }

    private func thisWeek() -> [WatchSession] {
        let monday = Self.thisWeekMonday()
        let iso = ISO8601DateFormatter()
        return recent.filter {
            guard let d = iso.date(from: $0.startedAt) else { return false }
            return d >= monday
        }
    }

    private static func thisWeekMonday() -> Date {
        var cal = Calendar(identifier: .gregorian)
        cal.firstWeekday = 2 // Monday
        let now = Date()
        let comps = cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: now)
        return cal.date(from: comps) ?? now
    }

    // ── Local fallback ──────────────────────────────────────────────────────────

    private func loadLocal() -> [WatchSession] {
        let fm = FileManager.default
        let docs = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let root = docs.appendingPathComponent("sessions", isDirectory: true)
        guard let ids = try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) else {
            return []
        }
        let decoder = JSONDecoder()
        let sessions = ids.compactMap { dir -> WatchSession? in
            let file = dir.appendingPathComponent("session.json")
            guard let data = try? Data(contentsOf: file) else { return nil }
            return try? decoder.decode(WatchSession.self, from: data)
        }
        return sessions
            .sorted { $0.startedAt > $1.startedAt }
            .prefix(limit)
            .map { $0 }
    }
}
