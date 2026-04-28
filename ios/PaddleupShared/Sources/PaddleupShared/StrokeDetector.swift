import Foundation

/// Real-time stroke detector. Mirrors the Kotlin implementation byte-for-byte
/// so the same sensor stream produces the same stroke times on iOS and Android.
public final class StrokeDetector {
    public struct Stroke: Sendable {
        public let tSec: Double
        public let rateSpm: Double
        public let confidence: Double
    }

    private let sampleRateHz: Double
    private let minStrokeRateSpm: Double
    private let maxStrokeRateSpm: Double
    private let peakThreshold: Double
    private let refractorySec: Double

    private let hpAlpha = 0.97
    private let lpAlpha = 0.25

    private var hpPrevIn = 0.0
    private var hpPrevOut = 0.0
    private var lpPrev = 0.0

    private var lastStrokeT: Double = -1
    private var lastSampleT: Double = -1
    private var lastValue: Double = 0
    private var rising = false

    public init(
        sampleRateHz: Double = 50,
        minStrokeRateSpm: Double = 30,
        maxStrokeRateSpm: Double = 120,
        peakThreshold: Double = 0.6
    ) {
        self.sampleRateHz = sampleRateHz
        self.minStrokeRateSpm = minStrokeRateSpm
        self.maxStrokeRateSpm = maxStrokeRateSpm
        self.peakThreshold = peakThreshold
        self.refractorySec = 60.0 / maxStrokeRateSpm
    }

    /// Feed one sample of linear acceleration (gravity already removed).
    public func onSample(tSec: Double, ax: Double, ay: Double, az: Double) -> Stroke? {
        let magnitude = sqrt(ax * ax + ay * ay + az * az)

        let hp = hpAlpha * (hpPrevOut + magnitude - hpPrevIn)
        hpPrevIn = magnitude
        hpPrevOut = hp

        let v = lpPrev + lpAlpha * (hp - lpPrev)
        lpPrev = v

        var stroke: Stroke?
        if lastSampleT > 0 {
            let nowRising = v > lastValue
            if rising && !nowRising && lastValue > peakThreshold {
                if lastStrokeT < 0 || (tSec - lastStrokeT) >= refractorySec {
                    let rate = lastStrokeT < 0 ? 0 : 60.0 / (tSec - lastStrokeT)
                    if rate == 0 || (rate >= minStrokeRateSpm && rate <= maxStrokeRateSpm) {
                        let prom = lastValue - peakThreshold
                        let conf = max(0, min(1, prom / (prom + 0.5)))
                        stroke = Stroke(tSec: lastSampleT, rateSpm: rate, confidence: conf)
                        lastStrokeT = lastSampleT
                    }
                }
            }
            rising = nowRising
        }
        lastValue = v
        lastSampleT = tSec
        return stroke
    }

    public func reset() {
        hpPrevIn = 0; hpPrevOut = 0; lpPrev = 0
        lastStrokeT = -1; lastSampleT = -1; lastValue = 0
        rising = false
    }
}
