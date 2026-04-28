import CoreLocation
import Foundation

struct GpsSample {
    let date: Date
    let lat: Double
    let lon: Double
    let altM: Double
    let speedMps: Double
    let accuracyM: Double
}

final class LocationTracker: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var continuation: AsyncStream<GpsSample>.Continuation?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.activityType = .fitness
        manager.allowsBackgroundLocationUpdates = true
        manager.pausesLocationUpdatesAutomatically = false
    }

    /// Async stream of 1 Hz GPS samples. Cancellation stops the manager.
    func stream() -> AsyncStream<GpsSample> {
        AsyncStream { cont in
            self.continuation = cont
            cont.onTermination = { [weak self] _ in self?.manager.stopUpdatingLocation() }

            switch manager.authorizationStatus {
            case .notDetermined:
                manager.requestWhenInUseAuthorization()
            default: break
            }
            manager.startUpdatingLocation()
        }
    }

    // MARK: - CLLocationManagerDelegate

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for loc in locations {
            continuation?.yield(GpsSample(
                date: loc.timestamp,
                lat: loc.coordinate.latitude,
                lon: loc.coordinate.longitude,
                altM: loc.altitude,
                speedMps: max(0, loc.speed),
                accuracyM: loc.horizontalAccuracy
            ))
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Surface to UI in a future revision; ignore transient errors for now.
    }
}
