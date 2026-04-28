package app.paddleup.shared.stroke

import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Real-time stroke detector for outrigger paddling.
 *
 * Pipeline:
 *   1. Compute acceleration magnitude (|a| - g if linear accel; just |a| if
 *      device-motion linear acceleration is provided).
 *   2. High-pass to remove drift, then low-pass to smooth.
 *   3. Peak-pick on the smoothed signal with a refractory window.
 *   4. Emit a stroke event with an instantaneous rate (60 / interval) and
 *      a confidence score from peak prominence.
 *
 * Designed to be deterministic and identical to the iOS Swift implementation
 * so the same input yields the same stroke times on both platforms.
 */
class StrokeDetector(
    private val sampleRateHz: Double = 50.0,
    private val minStrokeRateSpm: Double = 30.0,
    private val maxStrokeRateSpm: Double = 120.0,
    private val peakThreshold: Double = 0.6,    // m/s² after band-pass
) {
    data class Stroke(val tSec: Double, val rateSpm: Double, val confidence: Double)

    private val refractorySec: Double = 60.0 / maxStrokeRateSpm

    private val hpAlpha: Double = 0.97
    private val lpAlpha: Double = 0.25

    private var hpPrevIn = 0.0
    private var hpPrevOut = 0.0
    private var lpPrev = 0.0

    private var lastStrokeT: Double = -1.0
    private var lastSampleT: Double = -1.0
    private var lastValue: Double = 0.0
    private var rising = false
    private var lastPeakValue = 0.0

    /**
     * Feed one sample of linear acceleration (gravity already removed).
     * Returns a [Stroke] if a peak was detected at this sample, else null.
     */
    fun onSample(tSec: Double, ax: Double, ay: Double, az: Double): Stroke? {
        val magnitude = sqrt(ax * ax + ay * ay + az * az)

        // High-pass: y[n] = α(y[n-1] + x[n] - x[n-1])
        val hp = hpAlpha * (hpPrevOut + magnitude - hpPrevIn)
        hpPrevIn = magnitude
        hpPrevOut = hp

        // Low-pass: y[n] = y[n-1] + α(x[n] - y[n-1])
        val v = lpPrev + lpAlpha * (hp - lpPrev)
        lpPrev = v

        var stroke: Stroke? = null
        if (lastSampleT > 0) {
            // Peak detection: rising → falling crossover with prominence > threshold.
            val nowRising = v > lastValue
            if (rising && !nowRising && lastValue > peakThreshold) {
                if (lastStrokeT < 0 || (tSec - lastStrokeT) >= refractorySec) {
                    val rate = if (lastStrokeT < 0) 0.0 else 60.0 / (tSec - lastStrokeT)
                    if (rate == 0.0 || rate in minStrokeRateSpm..maxStrokeRateSpm) {
                        val prom = lastValue - peakThreshold
                        val conf = (prom / (prom + 0.5)).coerceIn(0.0, 1.0)
                        stroke = Stroke(tSec = lastSampleT, rateSpm = rate, confidence = conf)
                        lastStrokeT = lastSampleT
                        lastPeakValue = lastValue
                    }
                }
            }
            rising = nowRising
        }
        lastValue = v
        lastSampleT = tSec
        return stroke
    }

    /** Reset internal state — call when the user pauses or resets a session. */
    fun reset() {
        hpPrevIn = 0.0; hpPrevOut = 0.0; lpPrev = 0.0
        lastStrokeT = -1.0; lastSampleT = -1.0; lastValue = 0.0
        rising = false; lastPeakValue = 0.0
    }

    @Suppress("unused")
    fun expectedSampleRate(): Double = sampleRateHz

    @Suppress("unused")
    private fun isFinite(d: Double) = !d.isNaN() && abs(d) < Double.MAX_VALUE
}
