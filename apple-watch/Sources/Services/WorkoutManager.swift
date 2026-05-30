import Foundation
import HealthKit
import CoreLocation
import CoreMotion
import WatchKit

// ── WorkoutManager.swift ──────────────────────────────────────────────────────
// Orchestrates a paddle session on Apple Watch:
//   HKWorkoutSession + HKLiveWorkoutBuilder → keeps GPS + HR sensors powered
//   CLLocationManager → 1 Hz GPS track points
//   CMMotionManager → 50 Hz accelerometer → StrokeDetector
//
// When stopAndSave() is called the manager assembles a WatchSession (same JSON
// schema as the phone model), computes aggregates, and calls TransferManager.

@MainActor
final class WorkoutManager: NSObject, ObservableObject {

    // ── Published state ───────────────────────────────────────────────────────
    @Published var isRecording = false
    @Published var distanceM = 0.0
    @Published var durationSec = 0.0
    @Published var heartRate = 0
    @Published var strokeRate = 0.0
    @Published var strokeCount = 0
    @Published var coordinates: [CLLocationCoordinate2D] = []

    var currentCraft = "OC1"

    // ── Private ───────────────────────────────────────────────────────────────
    private let healthStore = HKHealthStore()
    private var workoutSession: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    private let locationManager = CLLocationManager()
    private let motionManager = CMMotionManager()
    private let strokeDetector = StrokeDetector()

    private var track: [WatchTrackPoint] = []
    private var sessionStartDate: Date?
    private var sessionId = ""
    private var lastHrValue = 0
    private var currentStrokeRate = 0.0

    private var durationTimer: Timer?
    private var sessionStartEpoch = 0.0

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        locationManager.activityType = .fitness
        locationManager.distanceFilter = kCLDistanceFilterNone
    }

    // ── Authorization ─────────────────────────────────────────────────────────

    func requestAuthorization() async {
        let types: Set<HKSampleType> = [
            HKQuantityType(.heartRate),
            HKQuantityType(.distancePaddleSports),
            HKQuantityType(.activeEnergyBurned),
            .workoutType(),
        ]
        try? await healthStore.requestAuthorization(toShare: types, read: [HKQuantityType(.heartRate)])
    }

    // ── Session lifecycle ─────────────────────────────────────────────────────

    func start() async {
        await requestAuthorization()

        sessionId = generateId()
        sessionStartDate = Date()
        sessionStartEpoch = Date().timeIntervalSince1970
        track = []
        strokeDetector.reset()
        distanceM = 0
        durationSec = 0
        strokeCount = 0
        strokeRate = 0
        heartRate = 0
        coordinates = []

        // Start HKWorkoutSession (powers GPS chip and HR sensor)
        let config = HKWorkoutConfiguration()
        config.activityType = .paddleSports
        config.locationType = .outdoor

        do {
            let session = try HKWorkoutSession(healthStore: healthStore, configuration: config)
            let bldr = session.associatedWorkoutBuilder()
            bldr.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore,
                                                       workoutConfiguration: config)
            bldr.delegate = self
            session.delegate = self
            workoutSession = session
            builder = bldr

            session.startActivity(with: sessionStartDate!)
            try await bldr.beginCollection(at: sessionStartDate!)
        } catch {
            print("[WorkoutManager] HKWorkoutSession start failed: \(error)")
        }

        // Start location updates
        locationManager.requestWhenInUseAuthorization()
        locationManager.startUpdatingLocation()

        // Start accelerometer for stroke detection
        if motionManager.isAccelerometerAvailable {
            motionManager.accelerometerUpdateInterval = 1.0 / 50.0
            motionManager.startAccelerometerUpdates(to: .main) { [weak self] data, _ in
                guard let self, let data else { return }
                let a = data.acceleration
                let t = Date().timeIntervalSince1970 - self.sessionStartEpoch
                if let stroke = self.strokeDetector.onSample(tSec: t, ax: a.x, ay: a.y, az: a.z) {
                    self.strokeCount += 1
                    self.strokeRate = stroke.rateSpm
                    self.currentStrokeRate = stroke.rateSpm
                }
            }
        }

        // Duration ticker
        durationTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.durationSec += 1
        }

        isRecording = true

        // Fetch weather at session start (best-effort, non-blocking)
        Task {
            if let loc = locationManager.location {
                _ = await WeatherService.fetch(lat: loc.coordinate.latitude,
                                               lon: loc.coordinate.longitude)
            }
        }
    }

    func stopAndSave() async {
        guard isRecording, let startDate = sessionStartDate else { return }
        isRecording = false
        durationTimer?.invalidate()
        durationTimer = nil
        locationManager.stopUpdatingLocation()
        motionManager.stopAccelerometerUpdates()

        let endDate = Date()

        // Fetch weather at end (overrides start weather; more accurate)
        var weather: WatchWeatherSummary? = nil
        if let loc = locationManager.location {
            weather = await WeatherService.fetch(lat: loc.coordinate.latitude,
                                                  lon: loc.coordinate.longitude)
        }

        // Compute aggregates
        let totals = Aggregator.totals(track, strokeCount: strokeCount)
        let hr = Aggregator.hrSummary(track)
        let splits = Aggregator.splits(track)
        let trackSummary = Aggregator.downsample(track, maxPoints: 200)

        let session = WatchSession(
            id: sessionId,
            userId: "",   // filled by phone after receiving (phone knows the uid)
            schemaVersion: 1,
            source: "ios-watch",
            appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.1.0",
            craftType: currentCraft,
            startedAt: ISO8601DateFormatter().string(from: startDate),
            endedAt: ISO8601DateFormatter().string(from: endDate),
            totals: totals,
            hr: hr,
            splits: splits,
            sideSwitches: [],
            weather: weather,
            trackSummary: trackSummary,
            isPublic: false
        )

        // Finish HKWorkoutSession (writes to Health app)
        if let ws = workoutSession, let bldr = builder {
            ws.end()
            try? await bldr.endCollection(at: endDate)
            try? await bldr.finishWorkout()
        }

        // Persist + transfer to phone
        await TransferManager.shared.transferSession(session, fullTrack: track)
    }

    func discard() {
        isRecording = false
        durationTimer?.invalidate()
        locationManager.stopUpdatingLocation()
        motionManager.stopAccelerometerUpdates()
        workoutSession?.end()
        track = []
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private func generateId() -> String {
        let chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        return String((0..<21).map { _ in chars.randomElement()! })
    }
}

// ── CLLocationManagerDelegate ─────────────────────────────────────────────────

extension WorkoutManager: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager,
                                     didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        Task { @MainActor in
            let t = Date().timeIntervalSince1970 - self.sessionStartEpoch
            let pt = WatchTrackPoint(
                t: t,
                lat: loc.coordinate.latitude,
                lon: loc.coordinate.longitude,
                altM: loc.altitude,
                speedMps: max(0, loc.speed),
                hr: self.lastHrValue > 0 ? self.lastHrValue : nil,
                strokeRate: self.currentStrokeRate > 0 ? self.currentStrokeRate : nil
            )
            self.track.append(pt)
            self.coordinates.append(loc.coordinate)

            // Update live distance
            if self.track.count >= 2 {
                let prev = self.track[self.track.count - 2]
                let d = self.haversine(lat1: prev.lat, lon1: prev.lon,
                                       lat2: pt.lat, lon2: pt.lon)
                self.distanceM += d
            }
        }
    }

    private func haversine(lat1: Double, lon1: Double, lat2: Double, lon2: Double) -> Double {
        let R = 6371000.0
        let φ1 = lat1 * .pi/180, φ2 = lat2 * .pi/180
        let Δφ = (lat2-lat1) * .pi/180, Δλ = (lon2-lon1) * .pi/180
        let a = sin(Δφ/2)*sin(Δφ/2) + cos(φ1)*cos(φ2)*sin(Δλ/2)*sin(Δλ/2)
        return R * 2 * atan2(a.squareRoot(), (1-a).squareRoot())
    }
}

// ── HKWorkoutSessionDelegate ──────────────────────────────────────────────────

extension WorkoutManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession,
                                    didChangeTo toState: HKWorkoutSessionState,
                                    from fromState: HKWorkoutSessionState, date: Date) {}
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession,
                                    didFailWithError error: Error) {
        print("[WorkoutManager] HKWorkoutSession error: \(error)")
    }
}

// ── HKLiveWorkoutBuilderDelegate ──────────────────────────────────────────────

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder,
                                    didCollectDataOf collectedTypes: Set<HKSampleType>) {
        for type in collectedTypes {
            guard let quantityType = type as? HKQuantityType else { continue }
            if quantityType == HKQuantityType(.heartRate) {
                let stat = workoutBuilder.statistics(for: quantityType)
                let hr = stat?.mostRecentQuantity()?.doubleValue(for: .init(from: "count/min")) ?? 0
                Task { @MainActor in
                    self.heartRate = Int(hr)
                    self.lastHrValue = Int(hr)
                }
            }
        }
    }
}
