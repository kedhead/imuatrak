import CoreMotion
import Foundation
import PaddleupShared

struct StrokeEvent {
    let tSec: Double
    let rateSpm: Double
    let confidence: Double
}

final class MotionTracker {
    private let motion = CMMotionManager()
    private let queue = OperationQueue()
    private let detector = StrokeDetector(sampleRateHz: 50)
    private var t0: TimeInterval = 0

    init() {
        queue.name = "app.paddleup.motion"
        queue.qualityOfService = .userInitiated
        motion.deviceMotionUpdateInterval = 1.0 / 50.0
    }

    /// Async stream of detected strokes. The first sample sets t = 0.
    func strokes() -> AsyncStream<StrokeEvent> {
        AsyncStream { cont in
            guard motion.isDeviceMotionAvailable else { cont.finish(); return }
            t0 = 0
            motion.startDeviceMotionUpdates(to: queue) { [weak self] motion, _ in
                guard let self, let m = motion else { return }
                if t0 == 0 { t0 = m.timestamp }
                let t = m.timestamp - t0
                if let s = detector.onSample(
                    tSec: t,
                    ax: m.userAcceleration.x,
                    ay: m.userAcceleration.y,
                    az: m.userAcceleration.z
                ) {
                    cont.yield(StrokeEvent(tSec: s.tSec, rateSpm: s.rateSpm, confidence: s.confidence))
                }
            }
            cont.onTermination = { [weak self] _ in self?.motion.stopDeviceMotionUpdates() }
        }
    }
}
