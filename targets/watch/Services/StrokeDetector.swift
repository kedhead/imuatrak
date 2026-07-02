import Foundation

// ── StrokeDetector.swift ──────────────────────────────────────────────────────
// Direct Swift port of src/services/stroke-detector.ts.
// Pipeline: |a| → high-pass → low-pass → peak pick with refractory window.
// Keep DSP coefficients identical so phone and watch sessions are comparable.

struct Stroke {
    let tSec: Double
    let rateSpm: Double
    let confidence: Double
}

final class StrokeDetector {
    private let minSpm: Double
    private let maxSpm: Double
    private let peakThreshold: Double
    private let refractorySec: Double

    // Same coefficients as TypeScript
    private let hpAlpha = 0.97
    private let lpAlpha = 0.25

    private var hpPrevIn = 0.0
    private var hpPrevOut = 0.0
    private var lpPrev = 0.0

    private var lastStrokeT = -1.0
    private var lastSampleT = -1.0
    private var lastValue = 0.0
    private var rising = false

    init(minSpm: Double = 30, maxSpm: Double = 120, peakThreshold: Double = 0.6) {
        self.minSpm = minSpm
        self.maxSpm = maxSpm
        self.peakThreshold = peakThreshold
        self.refractorySec = 60.0 / maxSpm
    }

    /// Feed one gravity-removed accelerometer sample. Returns a Stroke if a
    /// peak was detected, otherwise nil.
    func onSample(tSec: Double, ax: Double, ay: Double, az: Double) -> Stroke? {
        let magnitude = (ax*ax + ay*ay + az*az).squareRoot()

        let hp = hpAlpha * (hpPrevOut + magnitude - hpPrevIn)
        hpPrevIn = magnitude
        hpPrevOut = hp

        let v = lpPrev + lpAlpha * (hp - lpPrev)
        lpPrev = v

        var stroke: Stroke? = nil
        if lastSampleT > 0 {
            let nowRising = v > lastValue
            if rising && !nowRising && lastValue > peakThreshold {
                if lastStrokeT < 0 || tSec - lastStrokeT >= refractorySec {
                    let rate = lastStrokeT < 0 ? 0.0 : 60.0 / (tSec - lastStrokeT)
                    if rate == 0 || (rate >= minSpm && rate <= maxSpm) {
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

    func reset() {
        hpPrevIn = 0; hpPrevOut = 0; lpPrev = 0
        lastStrokeT = -1; lastSampleT = -1; lastValue = 0; rising = false
    }
}
