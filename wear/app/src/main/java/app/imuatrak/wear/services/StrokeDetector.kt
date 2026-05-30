package app.imuatrak.wear.services

import kotlin.math.sqrt

// ── StrokeDetector.kt ─────────────────────────────────────────────────────────
// Direct Kotlin port of src/services/stroke-detector.ts.
// Same DSP coefficients — results are numerically consistent with the phone app.

data class Stroke(val tSec: Double, val rateSpm: Double, val confidence: Double)

class StrokeDetector(
    private val minSpm: Double = 30.0,
    private val maxSpm: Double = 120.0,
    private val peakThreshold: Double = 0.6,
) {
    private val refractorySec = 60.0 / maxSpm
    private val hpAlpha = 0.97
    private val lpAlpha = 0.25

    private var hpPrevIn = 0.0
    private var hpPrevOut = 0.0
    private var lpPrev = 0.0
    private var lastStrokeT = -1.0
    private var lastSampleT = -1.0
    private var lastValue = 0.0
    private var rising = false

    fun onSample(tSec: Double, ax: Double, ay: Double, az: Double): Stroke? {
        val magnitude = sqrt(ax*ax + ay*ay + az*az)
        val hp = hpAlpha * (hpPrevOut + magnitude - hpPrevIn)
        hpPrevIn = magnitude; hpPrevOut = hp
        val v = lpPrev + lpAlpha * (hp - lpPrev)
        lpPrev = v

        var stroke: Stroke? = null
        if (lastSampleT > 0) {
            val nowRising = v > lastValue
            if (rising && !nowRising && lastValue > peakThreshold) {
                if (lastStrokeT < 0 || tSec - lastStrokeT >= refractorySec) {
                    val rate = if (lastStrokeT < 0) 0.0 else 60.0 / (tSec - lastStrokeT)
                    if (rate == 0.0 || (rate in minSpm..maxSpm)) {
                        val prom = lastValue - peakThreshold
                        val conf = maxOf(0.0, minOf(1.0, prom / (prom + 0.5)))
                        stroke = Stroke(lastSampleT, rate, conf)
                        lastStrokeT = lastSampleT
                    }
                }
            }
            rising = nowRising
        }
        lastValue = v; lastSampleT = tSec
        return stroke
    }

    fun reset() {
        hpPrevIn = 0.0; hpPrevOut = 0.0; lpPrev = 0.0
        lastStrokeT = -1.0; lastSampleT = -1.0; lastValue = 0.0; rising = false
    }
}
