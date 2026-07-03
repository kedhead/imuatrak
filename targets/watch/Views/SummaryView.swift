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
                        .foregroundStyle(Color.imuaSeafoam)
                }

                Button("Done") {
                    path = NavigationPath()
                }
                .buttonStyle(.borderedProminent)
                .tint(.imuaAqua)
            }
            .padding()
        }
        .navigationTitle("Nice paddle!")
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
            StatCell(icon: "map.fill", label: "DISTANCE",
                     value: "\(Fmt.distanceValue(distance)) \(Fmt.distanceUnit.lowercased())",
                     color: .imuaAqua)
            StatCell(icon: "timer", label: "TIME",
                     value: Fmt.duration(duration), color: .white)
            StatCell(icon: "repeat", label: "STROKES",
                     value: "\(strokeCount)", color: .imuaGold)
            StatCell(icon: "heart.fill", label: "AVG HR",
                     value: heartRate > 0 ? "\(heartRate) bpm" : "—",
                     color: .imuaCoral)
        }
    }
}

private struct StatCell: View {
    let icon: String
    let label: String
    let value: String
    var color: Color = .white

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 3) {
                Image(systemName: icon)
                    .font(.system(size: 9))
                    .foregroundStyle(color.opacity(0.8))
                Text(label)
                    .font(.system(.caption2, design: .rounded))
                    .foregroundStyle(.secondary)
            }
            Text(value)
                .font(.system(.callout, design: .rounded).bold())
                .foregroundStyle(color)
                .monospacedDigit()
                .minimumScaleFactor(0.7)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}
