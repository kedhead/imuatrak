import SwiftUI
import MapKit

struct SummaryView: View {
    @EnvironmentObject var workoutManager: WorkoutManager
    @EnvironmentObject var transferManager: TransferManager
    @Binding var path: NavigationPath

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                // Route map
                if workoutManager.coordinates.count >= 2 {
                    RouteMapView(coordinates: workoutManager.coordinates)
                        .frame(height: 120)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                // Key stats
                StatsGrid(
                    distance: workoutManager.distanceM,
                    duration: workoutManager.durationSec,
                    strokeCount: workoutManager.strokeCount,
                    heartRate: workoutManager.heartRate
                )

                // Transfer status
                if !transferManager.pendingTransfers.isEmpty {
                    HStack(spacing: 6) {
                        ProgressView().controlSize(.mini)
                        Text("Syncing to iPhone…")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 6)
                } else {
                    Label("Synced", systemImage: "checkmark.circle.fill")
                        .font(.caption2)
                        .foregroundStyle(.green)
                }

                Button("Done") {
                    path = NavigationPath()
                }
                .buttonStyle(.borderedProminent)
                .tint(.cyan)
            }
            .padding()
        }
        .navigationTitle("Session Done")
    }
}

private struct RouteMapView: View {
    let coordinates: [CLLocationCoordinate2D]

    @State private var region: MKCoordinateRegion

    init(coordinates: [CLLocationCoordinate2D]) {
        self.coordinates = coordinates
        // Compute bounding region
        let lats = coordinates.map { $0.latitude }
        let lons = coordinates.map { $0.longitude }
        let center = CLLocationCoordinate2D(
            latitude: (lats.min()! + lats.max()!) / 2,
            longitude: (lons.min()! + lons.max()!) / 2
        )
        let span = MKCoordinateSpan(
            latitudeDelta: max(0.005, (lats.max()! - lats.min()!) * 1.3),
            longitudeDelta: max(0.005, (lons.max()! - lons.min()!) * 1.3)
        )
        _region = State(initialValue: MKCoordinateRegion(center: center, span: span))
    }

    var body: some View {
        Map(coordinateRegion: $region)
    }
}

private struct StatsGrid: View {
    let distance: Double
    let duration: Double
    let strokeCount: Int
    let heartRate: Int

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
            StatCell(label: "DISTANCE",
                     value: String(format: "%.2f km", distance / 1000))
            StatCell(label: "TIME",
                     value: formatDuration(duration))
            StatCell(label: "STROKES",
                     value: "\(strokeCount)")
            StatCell(label: "AVG HR",
                     value: heartRate > 0 ? "\(heartRate) bpm" : "—")
        }
    }
}

private struct StatCell: View {
    let label: String
    let value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(.caption2, design: .rounded))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(.callout, design: .rounded).bold())
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

private func formatDuration(_ sec: Double) -> String {
    let s = Int(sec)
    let h = s/3600, m = (s%3600)/60, r = s%60
    if h > 0 { return String(format: "%d:%02d:%02d", h, m, r) }
    return String(format: "%d:%02d", m, r)
}
