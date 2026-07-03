import SwiftUI
import CoreLocation

struct PreRecordView: View {
    @EnvironmentObject var workoutManager: WorkoutManager
    @Binding var path: NavigationPath
    @StateObject private var locHelper = LocationAccuracyHelper()

    var body: some View {
        VStack(spacing: 12) {
            // GPS accuracy ring
            ZStack {
                Circle()
                    .stroke(Color.gray.opacity(0.3), lineWidth: 4)
                    .frame(width: 60, height: 60)
                Circle()
                    .trim(from: 0, to: locHelper.accuracyFraction)
                    .stroke(locHelper.accuracyColor, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .frame(width: 60, height: 60)
                    .rotationEffect(.degrees(-90))
                    .animation(.easeInOut(duration: 0.5), value: locHelper.accuracyFraction)
                Image(systemName: "location.fill")
                    .foregroundStyle(locHelper.accuracyColor)
                    .font(.title3)
            }

            Text(locHelper.statusLabel)
                .font(.caption2)
                .foregroundStyle(.secondary)

            Text(workoutManager.currentCraft)
                .font(.headline)
                .padding(.top, 4)

            Button {
                // Navigation to the recording screen is driven by
                // isRecording in ContentView (shared with the Siri intent).
                Task { await workoutManager.start() }
            } label: {
                Label("Start", systemImage: "play.fill")
                    .font(.headline)
            }
            .buttonStyle(.borderedProminent)
            .tint(.green)
            .disabled(!locHelper.isReady)
        }
        .padding()
        .navigationTitle("Ready?")
        .onAppear { locHelper.start() }
        .onDisappear { locHelper.stop() }
    }
}

// Monitors GPS accuracy to show readiness
@MainActor
final class LocationAccuracyHelper: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var accuracyFraction = 0.0
    @Published var statusLabel = "Acquiring GPS…"
    @Published var isReady = false

    private let lm = CLLocationManager()
    override init() { super.init(); lm.delegate = self }
    func start() { lm.requestWhenInUseAuthorization(); lm.startUpdatingLocation() }
    func stop() { lm.stopUpdatingLocation() }

    var accuracyColor: Color {
        accuracyFraction > 0.7 ? .green : accuracyFraction > 0.4 ? .yellow : .orange
    }

    nonisolated func locationManager(_ manager: CLLocationManager,
                                      didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last, loc.horizontalAccuracy >= 0 else { return }
        Task { @MainActor in
            // Map accuracy 0–50 m to fraction 1→0 (better accuracy = higher fraction)
            self.accuracyFraction = max(0, min(1, 1.0 - (loc.horizontalAccuracy / 50.0)))
            self.isReady = loc.horizontalAccuracy < 20
            self.statusLabel = self.isReady ? "GPS ready (\(Int(loc.horizontalAccuracy)) m)"
                                            : "GPS: \(Int(loc.horizontalAccuracy)) m…"
        }
    }
}
