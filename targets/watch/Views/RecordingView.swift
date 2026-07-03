import SwiftUI
import MapKit

struct RecordingView: View {
    @EnvironmentObject var workoutManager: WorkoutManager
    @Binding var path: NavigationPath
    @State private var showStopAlert = false

    var body: some View {
        TabView {
            // Page 1 — Controls (pause/resume, end) — like the Workout app
            ControlsPage(showStopAlert: $showStopAlert)
            // Page 2 — Pace metrics
            MetricsPage1()
            // Page 3 — Heart rate & strokes
            MetricsPage2()
            // Page 4 — Live map
            LiveMapPage()
        }
        .tabViewStyle(.carousel)
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

// ── Page 1: Controls ──────────────────────────────────────────────────────────

private struct ControlsPage: View {
    @EnvironmentObject var wm: WorkoutManager
    @Binding var showStopAlert: Bool

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 12) {
                ControlButton(
                    icon: wm.isPaused ? "play.fill" : "pause.fill",
                    label: wm.isPaused ? "Resume" : "Pause",
                    color: wm.isPaused ? .imuaSeafoam : .imuaGold
                ) {
                    wm.isPaused ? wm.resume() : wm.pause()
                }
                ControlButton(icon: "stop.fill", label: "End", color: .imuaCoral) {
                    showStopAlert = true
                }
            }
            if wm.isPaused {
                Text("PAUSED")
                    .font(.system(.caption2, design: .rounded).bold())
                    .foregroundStyle(Color.imuaGold)
            } else {
                Text(Fmt.duration(wm.durationSec))
                    .font(.system(.caption2, design: .rounded).bold())
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
        }
    }
}

private struct ControlButton: View {
    let icon: String
    let label: String
    let color: Color
    let action: () -> Void

    var body: some View {
        VStack(spacing: 4) {
            Button(action: action) {
                Image(systemName: icon)
                    .font(.title3.bold())
                    .foregroundStyle(color)
                    .frame(width: 56, height: 56)
                    .background(Circle().fill(color.opacity(0.2)))
            }
            .buttonStyle(.plain)
            Text(label)
                .font(.system(.caption2, design: .rounded))
                .foregroundStyle(.secondary)
        }
    }
}

// ── Page 2: Distance hero / Time / Pace ──────────────────────────────────────

private struct MetricsPage1: View {
    @EnvironmentObject var wm: WorkoutManager

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Hero distance
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(Fmt.distanceValue(wm.distanceM))
                        .font(.system(size: 40, weight: .heavy, design: .rounded))
                        .foregroundStyle(Color.imuaAqua)
                        .monospacedDigit()
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    Text(Fmt.distanceUnit)
                        .font(.system(.footnote, design: .rounded).bold())
                        .foregroundStyle(.secondary)
                }
                RecordingDot(craft: wm.currentCraft)
            }

            Divider()
            MetricRow(icon: "timer", label: "TIME",
                      value: Fmt.duration(wm.durationSec), color: .white)
            Divider()
            MetricRow(icon: "speedometer", label: "PACE",
                      value: Fmt.pace(distanceM: wm.distanceM, durationSec: wm.durationSec),
                      color: .imuaSeafoam)
        }
        .padding(.horizontal)
    }
}

// Small "recording"/"paused" indicator with the craft badge under the hero number.
private struct RecordingDot: View {
    @EnvironmentObject var wm: WorkoutManager
    let craft: String
    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(wm.isPaused ? Color.imuaGold : Color.imuaCoral)
                .frame(width: 6, height: 6)
            Text(wm.isPaused ? "PAUSED · \(craft)" : craft)
                .font(.system(.caption2, design: .rounded).bold())
                .foregroundStyle(wm.isPaused ? Color.imuaGold : craftColor(craft))
        }
    }
}

// ── Page 2: Heart Rate / Stroke Rate / Strokes ───────────────────────────────

private struct MetricsPage2: View {
    @EnvironmentObject var wm: WorkoutManager
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            MetricRow(icon: "heart.fill", label: "HEART RATE",
                      value: wm.heartRate > 0 ? "\(wm.heartRate) bpm" : "—",
                      color: .imuaCoral)
            Divider()
            MetricRow(icon: "water.waves", label: "STROKE RATE",
                      value: wm.strokeRate > 0 ? String(format: "%.0f spm", wm.strokeRate) : "—",
                      color: .imuaAqua)
            Divider()
            MetricRow(icon: "repeat", label: "STROKES",
                      value: "\(wm.strokeCount)", color: .imuaGold)
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
            MapMarker(coordinate: pin.coord, tint: .imuaAqua)
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
    let icon: String
    let label: String
    let value: String
    var color: Color = .white

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.caption2)
                .foregroundStyle(color.opacity(0.8))
                .frame(width: 16)
            Text(label)
                .font(.system(.caption2, design: .rounded))
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.system(.title3, design: .rounded).bold())
                .foregroundStyle(color)
                .monospacedDigit()
                .minimumScaleFactor(0.7)
                .lineLimit(1)
        }
    }
}
