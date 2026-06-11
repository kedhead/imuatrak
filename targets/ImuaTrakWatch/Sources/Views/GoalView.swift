import SwiftUI

// ── GoalView.swift ────────────────────────────────────────────────────────────
// Weekly goal glance: distance + time progress vs. the targets the phone pushes
// (SettingsCache). Shows "No weekly goal set" when no targets are configured.

struct GoalView: View {
    @EnvironmentObject var history: HistoryStore
    @EnvironmentObject var settings: SettingsCache

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if settings.hasGoal {
                    if settings.weeklyGoalDistanceKm > 0 {
                        GoalRing(
                            title: "Distance",
                            current: history.weekDistanceKm,        // km (metric base)
                            goal: settings.weeklyGoalDistanceKm,    // km (metric base)
                            unit: settings.imperial ? "mi" : "km",
                            displayScale: settings.imperial ? 0.621371 : 1,
                            tint: .cyan
                        )
                    }
                    if settings.weeklyGoalDurationMin > 0 {
                        GoalRing(
                            title: "Time",
                            current: history.weekDurationMin,       // minutes
                            goal: settings.weeklyGoalDurationMin,   // minutes
                            unit: "min",
                            displayScale: 1,
                            tint: .green
                        )
                    }
                } else {
                    VStack(spacing: 6) {
                        Image(systemName: "target").font(.title2).foregroundStyle(.secondary)
                        Text("No weekly goal set")
                            .font(.caption).foregroundStyle(.secondary)
                        Text("Set goals in the iPhone app")
                            .font(.caption2).foregroundStyle(.tertiary)
                    }
                    .padding(.top, 20)
                }
            }
            .padding()
        }
        .navigationTitle("This Week")
        .task { await history.refresh() }
    }
}

private struct GoalRing: View {
    let title: String
    let current: Double      // metric base (km / min)
    let goal: Double         // metric base (km / min)
    let unit: String
    let displayScale: Double // metric→display multiplier for the label only
    let tint: Color

    // Progress is computed in metric (both sides same unit); scaling is display-only.
    private var progress: Double { goal > 0 ? min(1, current / goal) : 0 }
    private var displayCurrent: Double { current * displayScale }
    private var displayGoal: Double { goal * displayScale }

    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                Circle().stroke(tint.opacity(0.2), lineWidth: 8)
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(tint, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack(spacing: 0) {
                    Text(String(format: "%.0f%%", progress * 100))
                        .font(.system(.headline, design: .rounded).bold())
                        .monospacedDigit()
                }
            }
            .frame(width: 90, height: 90)

            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(String(format: "%.1f / %.0f %@", displayCurrent, displayGoal, unit))
                .font(.caption2).foregroundStyle(.secondary).monospacedDigit()
        }
    }
}
