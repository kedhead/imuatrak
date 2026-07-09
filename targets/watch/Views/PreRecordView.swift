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

            // Craft badge in its brand color
            Text(workoutManager.currentCraft)
                .font(.system(.headline, design: .rounded).bold())
                .foregroundStyle(craftColor(workoutManager.currentCraft))
                .padding(.horizontal, 10)
                .padding(.vertical, 3)
                .background(
                    Capsule().fill(craftColor(workoutManager.currentCraft).opacity(0.18))
                )
                .padding(.top, 2)

            Button {
                // Navigation to the recording screen is driven by
                // isRecording in ContentView (shared with the Siri intent).
                Task { await workoutManager.start() }
            } label: {
                Label("Start", systemImage: "play.fill")
                    .font(.system(.headline, design: .rounded).bold())
            }
            .buttonStyle(.borderedProminent)
            .tint(.imuaAqua)
            // Deliberately NOT gated on GPS accuracy: a cold GPS start (or a
            // slow fix) used to leave this button disabled indefinitely. The
            // ring shows signal quality; GPS locks on during the paddle.
        }
        .padding()
        .navigationTitle("Ready?")
        .onAppear {
            locHelper.start()
            // Surface the one-time HealthKit prompt here, while the user is
            // idling on the Ready screen, instead of behind the Start tap.
            Task { await workoutManager.requestAuthorization() }
        }
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
        accuracyFraction > 0.7 ? .imuaSeafoam : accuracyFraction > 0.4 ? .imuaGold : .imuaSunset
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            if status == .denied || status == .restricted {
                self.statusLabel = "Location off — enable in Settings"
            }
        }
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
