import Foundation
import PaddleupShared

@MainActor
final class SessionRecorder: ObservableObject {

    struct LiveStats {
        var isRecording: Bool = false
        var startedAt: Date = .distantPast
        var durationSec: Double = 0
        var distanceMeters: Double = 0
        var currentSpeedMps: Double = 0
        var currentHr: Int? = nil
        var currentStrokeRate: Double = 0
        var strokeCount: Int = 0
    }

    @Published private(set) var live = LiveStats()

    private let location = LocationTracker()
    private let motion = MotionTracker()
    private let store = SessionStore()
    var sessionStore: SessionStore { store }

    private var locationTask: Task<Void, Never>?
    private var motionTask: Task<Void, Never>?

    private var sessionId: String?
    private var craftType: CraftType = .OC1
    private var startedAt: Date = .distantPast
    private var track: [TrackPoint] = []
    private var strokeCount: Int = 0
    private var lastStrokeRate: Double = 0

    func start(craft: CraftType) {
        guard !live.isRecording else { return }
        self.craftType = craft
        self.sessionId = UUID().uuidString
        self.startedAt = Date()
        self.track.removeAll(keepingCapacity: true)
        self.strokeCount = 0
        self.lastStrokeRate = 0
        self.live = LiveStats(isRecording: true, startedAt: startedAt)

        locationTask = Task { [location, weak self] in
            for await s in location.stream() {
                guard let self else { return }
                let t = s.date.timeIntervalSince(self.startedAt)
                let p = TrackPoint(
                    t: t, lat: s.lat, lon: s.lon, altM: s.altM, speedMps: s.speedMps,
                    hr: nil,
                    strokeRate: self.lastStrokeRate > 0 ? self.lastStrokeRate : nil
                )
                self.track.append(p)
                let totals = SessionAggregator.totals(points: self.track, strokeCount: self.strokeCount)
                self.live.durationSec = t
                self.live.distanceMeters = totals.distanceMeters
                self.live.currentSpeedMps = s.speedMps
                self.live.strokeCount = self.strokeCount
            }
        }

        motionTask = Task { [motion, weak self] in
            for await s in motion.strokes() {
                guard let self else { return }
                self.strokeCount += 1
                self.lastStrokeRate = s.rateSpm
                self.live.currentStrokeRate = s.rateSpm
                self.live.strokeCount = self.strokeCount
            }
        }
    }

    func stopAndSave(uid: String) async -> Session? {
        guard live.isRecording, let id = sessionId else { return nil }
        locationTask?.cancel(); motionTask?.cancel()
        locationTask = nil; motionTask = nil

        let endedAt = Date()
        let totals = SessionAggregator.totals(points: track, strokeCount: strokeCount)
        let splits = SessionAggregator.splits(points: track)
        let hr = SessionAggregator.hrSummary(points: track)
        let summary = Geo.downsample(track, target: 200).map {
            TrackSummaryPoint(t: $0.t, lat: $0.lat, lon: $0.lon, altM: $0.altM, speedMps: $0.speedMps)
        }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        let session = Session(
            id: id,
            userId: uid,
            source: .iosPhone,
            appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.1.0",
            craftType: craftType,
            startedAt: iso.string(from: startedAt),
            endedAt: iso.string(from: endedAt),
            totals: totals,
            hr: hr,
            splits: splits,
            sideSwitches: [],
            weather: nil,
            trackSummary: summary
        )
        try? store.save(session: session, track: track)
        live = LiveStats()
        sessionId = nil
        return session
    }

    func discard() {
        locationTask?.cancel(); motionTask?.cancel()
        locationTask = nil; motionTask = nil
        track.removeAll()
        sessionId = nil
        live = LiveStats()
    }
}
