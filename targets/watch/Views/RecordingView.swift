import SwiftUI
import MapKit

struct RecordingView: View {
    @EnvironmentObject var workoutManager: WorkoutManager
    @Binding var path: NavigationPath
    @State private var showStopAlert = false

    var body: some View {
        TabView {
            // Page 1 — Pace metrics
            MetricsPage1()
            // Page 2 — Heart rate & strokes
            MetricsPage2()
            // Page 3 — Live map
            LiveMapPage()
        }
        .tabViewStyle(.carousel)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showStopAlert = true
                } label: {
                    Image(systemName: "stop.fill").foregroundStyle(.red)
                }
            }
        }
        .alert("Stop Session?", isPresented: $showStopAlert) {
            Button("Stop & Save", role: .destructive) {
                Task {
                    await workoutManager.stopAndSave()
                    path.append("summary")
                }
            }
            Button("Discard", role: .destructive) {
                workoutManager.discard()
                path = NavigationPath()
            }
            Button("Cancel", role: .cancel) {}
        }
    }
}

// ── Page 1: Distance / Time / Pace ───────────────────────────────────────────

private struct MetricsPage1: View {
    @EnvironmentObject var wm: WorkoutManager
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            MetricRow(label: "KM", value: String(format: "%.2f", wm.distanceM / 1000))
            Divider()
            MetricRow(label: "TIME", value: formatDuration(wm.durationSec))
            Divider()
            MetricRow(label: "PACE", value: formatPace(wm.distanceM, wm.durationSec))
        }
        .padding(.horizontal)
    }
}

// ── Page 2: Heart Rate / Stroke Rate / Strokes ───────────────────────────────

private struct MetricsPage2: View {
    @EnvironmentObject var wm: WorkoutManager
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            MetricRow(label: "HR", value: wm.heartRate > 0 ? "\(wm.heartRate) bpm" : "—",
                      color: .red)
            Divider()
            MetricRow(label: "SPM", value: wm.strokeRate > 0 ? String(format: "%.0f", wm.strokeRate) : "—",
                      color: .cyan)
            Divider()
            MetricRow(label: "STROKES", value: "\(wm.strokeCount)")
        }
        .padding(.horizontal)
    }
}

// ── Page 3: Live map ──────────────────────────────────────────────────────────

private struct LiveMapPage: View {
    @EnvironmentObject var wm: WorkoutManager
    @State private var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 21.3, longitude: -157.8),
        span: MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02)
    )

    var body: some View {
        Map(coordinateRegion: $region, annotationItems: wm.coordinates.last.map { [MapPin(coord: $0)] } ?? []) { pin in
            MapMarker(coordinate: pin.coord, tint: .cyan)
        }
        .overlay(MapPolylineOverlay(coords: wm.coordinates))
        // CLLocationCoordinate2D isn't Equatable, so observe the array count
        // and re-center on the latest fix whenever a new point lands.
        .onChange(of: wm.coordinates.count) { _ in
            guard let coord = wm.coordinates.last else { return }
            region.center = coord
        }
    }
}

struct MapPin: Identifiable {
    let id = UUID()
    let coord: CLLocationCoordinate2D
}

// Simple overlay for the live route polyline on watchOS
struct MapPolylineOverlay: View {
    let coords: [CLLocationCoordinate2D]
    // On watchOS, MapKit supports MKPolylineRenderer natively via UIViewRepresentable
    // but for simplicity we skip the overlay in MVP and rely on the position marker.
    var body: some View { EmptyView() }
}

// ── Shared metric row ─────────────────────────────────────────────────────────

private struct MetricRow: View {
    let label: String
    let value: String
    var color: Color = .white

    var body: some View {
        HStack {
            Text(label)
                .font(.system(.caption2, design: .rounded))
                .foregroundStyle(.secondary)
                .frame(width: 60, alignment: .leading)
            Spacer()
            Text(value)
                .font(.system(.title3, design: .rounded).bold())
                .foregroundStyle(color)
                .monospacedDigit()
        }
    }
}

// ── Format helpers ────────────────────────────────────────────────────────────

private func formatDuration(_ sec: Double) -> String {
    let s = Int(sec)
    let h = s / 3600, m = (s % 3600) / 60, r = s % 60
    if h > 0 { return String(format: "%d:%02d:%02d", h, m, r) }
    return String(format: "%d:%02d", m, r)
}

private func formatPace(_ distM: Double, _ durSec: Double) -> String {
    guard distM > 50 else { return "—" }
    let secPerKm = durSec / (distM / 1000)
    let m = Int(secPerKm) / 60, s = Int(secPerKm) % 60
    return String(format: "%d:%02d /km", m, s)
}
