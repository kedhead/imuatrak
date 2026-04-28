package app.paddleup.shared.stroke

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.sin

class StrokeDetectorTest {

    @Test
    fun `detects strokes from a clean sinusoid at 60 spm`() {
        val det = StrokeDetector(sampleRateHz = 50.0)
        val durationSec = 30.0
        val freqHz = 1.0   // 60 spm
        val sampleDt = 1.0 / 50.0
        val samples = (0..(durationSec / sampleDt).toInt()).map { i ->
            val t = i * sampleDt
            t to 2.0 * sin(2 * PI * freqHz * t)
        }
        val strokes = mutableListOf<StrokeDetector.Stroke>()
        for ((t, v) in samples) {
            det.onSample(t, v, 0.0, 0.0)?.let { strokes += it }
        }
        // Allow first stroke to be skipped (initial filter ramp).
        assertTrue("expected ~30 strokes, got ${strokes.size}", strokes.size in 25..32)
        if (strokes.size >= 5) {
            val rateAvg = strokes.drop(2).map { it.rateSpm }.average()
            assertEquals(60.0, rateAvg, 5.0)
        }
    }
}
