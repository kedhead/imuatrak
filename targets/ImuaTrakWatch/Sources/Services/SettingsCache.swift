import Foundation
import Combine

// ── SettingsCache.swift ───────────────────────────────────────────────────────
// Holds the user's weekly goals + unit/craft prefs that the phone pushes over
// WatchConnectivity. Persisted in the shared App Group so values survive relaunch
// and are available before the next context arrives. Defaults to 0 goals
// ("no weekly goal set"), mirroring the phone's defaults.

@MainActor
final class SettingsCache: ObservableObject {
    static let shared = SettingsCache()

    @Published var weeklyGoalDistanceKm: Double
    @Published var weeklyGoalDurationMin: Double
    @Published var units: String
    @Published var defaultCraft: String

    private let defaults = UserDefaults(suiteName: "group.app.imuatrak") ?? .standard

    private init() {
        weeklyGoalDistanceKm = defaults.double(forKey: "weeklyGoalDistanceKm")
        weeklyGoalDurationMin = defaults.double(forKey: "weeklyGoalDurationMin")
        units = defaults.string(forKey: "units") ?? "metric"
        defaultCraft = defaults.string(forKey: "defaultCraft") ?? "OC1"
    }

    var hasGoal: Bool { weeklyGoalDistanceKm > 0 || weeklyGoalDurationMin > 0 }
    var imperial: Bool { units == "imperial" }

    func update(from payload: [String: Any]) {
        if let v = payload["weeklyGoalDistanceKm"] as? Double { weeklyGoalDistanceKm = v }
        if let v = payload["weeklyGoalDurationMin"] as? Double { weeklyGoalDurationMin = v }
        if let v = payload["units"] as? String { units = v }
        if let v = payload["defaultCraft"] as? String { defaultCraft = v }
        persist()
    }

    private func persist() {
        defaults.set(weeklyGoalDistanceKm, forKey: "weeklyGoalDistanceKm")
        defaults.set(weeklyGoalDurationMin, forKey: "weeklyGoalDurationMin")
        defaults.set(units, forKey: "units")
        defaults.set(defaultCraft, forKey: "defaultCraft")
    }
}
