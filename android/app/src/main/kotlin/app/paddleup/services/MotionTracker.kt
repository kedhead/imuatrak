package app.paddleup.services

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import app.paddleup.shared.stroke.StrokeDetector
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import javax.inject.Inject
import javax.inject.Singleton

data class StrokeEvent(val tSec: Double, val rateSpm: Double, val confidence: Double)

@Singleton
class MotionTracker @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager

    /**
     * Emits stroke events derived from TYPE_LINEAR_ACCELERATION at 50 Hz.
     * The first event timestamp is t=0 (relative to subscription start).
     */
    fun strokes(): Flow<StrokeEvent> = callbackFlow {
        val sensor = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)
        if (sensor == null) {
            close()
            return@callbackFlow
        }
        val detector = StrokeDetector(sampleRateHz = 50.0)
        var t0Ns = -1L

        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                if (t0Ns < 0) t0Ns = event.timestamp
                val tSec = (event.timestamp - t0Ns) / 1_000_000_000.0
                val ax = event.values[0].toDouble()
                val ay = event.values[1].toDouble()
                val az = event.values[2].toDouble()
                detector.onSample(tSec, ax, ay, az)?.let { s ->
                    trySend(StrokeEvent(s.tSec, s.rateSpm, s.confidence))
                }
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
        }

        // 20_000 us = 50 Hz
        sensorManager.registerListener(listener, sensor, 20_000)
        awaitClose { sensorManager.unregisterListener(listener) }
    }
}
