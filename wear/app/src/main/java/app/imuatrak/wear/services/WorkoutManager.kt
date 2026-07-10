package app.imuatrak.wear.services

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import androidx.health.services.client.HealthServices
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.data.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.guava.await
import app.imuatrak.wear.models.*
import java.time.Instant
import java.time.format.DateTimeFormatter
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.sqrt

// ── WorkoutManager.kt ─────────────────────────────────────────────────────────
// Orchestrates a Wear OS paddle session:
//   HealthServicesClient ExerciseClient → keeps GPS + HR sensors powered and
//     streams LOCATION / HEART_RATE_BPM / SPEED via ExerciseUpdateCallback
//   SensorManager TYPE_LINEAR_ACCELERATION → 50 Hz → StrokeDetector
//
// Owned by ExerciseService (foreground service) so recording survives the
// screen turning off; the UI observes the StateFlows.

class WorkoutManager(private val context: Context) : SensorEventListener {

    // ── State ─────────────────────────────────────────────────────────────────
    private val _isRecording = MutableStateFlow(false)
    val isRecording: StateFlow<Boolean> = _isRecording
    private val _isPaused = MutableStateFlow(false)
    val isPaused: StateFlow<Boolean> = _isPaused
    private val _distanceM = MutableStateFlow(0.0)
    val distanceM: StateFlow<Double> = _distanceM
    private val _durationSec = MutableStateFlow(0L)
    val durationSec: StateFlow<Long> = _durationSec
    private val _heartRate = MutableStateFlow(0)
    val heartRate: StateFlow<Int> = _heartRate
    private val _strokeCount = MutableStateFlow(0)
    val strokeCount: StateFlow<Int> = _strokeCount
    private val _strokeRate = MutableStateFlow(0.0)
    val strokeRate: StateFlow<Double> = _strokeRate

    var currentCraft = "OC1"

    // ── Private ───────────────────────────────────────────────────────────────
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private val strokeDetector = StrokeDetector()
    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private var track = mutableListOf<WatchTrackPoint>()
    private var sessionId = ""
    private var sessionStart = 0L
    private var sessionStartEpoch = 0.0
    private var durationJob: Job? = null
    private var currentStrokeRate = 0.0
    private var lastHr = 0
    private var lastSpeedMps = 0.0

    private val exerciseClient get() = HealthServices.getClient(context).exerciseClient

    private val exerciseCallback = object : ExerciseUpdateCallback {
        override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
            if (_isPaused.value) return
            val metrics = update.latestMetrics
            metrics.getData(DataType.HEART_RATE_BPM).lastOrNull()?.let {
                updateHeartRate(it.value.toInt())
            }
            metrics.getData(DataType.SPEED).lastOrNull()?.let {
                lastSpeedMps = max(0.0, it.value)
            }
            for (sample in metrics.getData(DataType.LOCATION)) {
                val loc = sample.value
                val alt = loc.altitude.takeIf { it.isFinite() && abs(it) < 20_000 } ?: 0.0
                addGpsSample(loc.latitude, loc.longitude, alt, lastSpeedMps)
            }
        }

        override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) {}
        override fun onRegistered() {}
        override fun onRegistrationFailed(throwable: Throwable) {
            android.util.Log.e("WorkoutManager", "Exercise callback registration failed: $throwable")
        }
        override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) {}
    }

    // ── Start ─────────────────────────────────────────────────────────────────

    fun start() {
        sessionId = generateId()
        sessionStart = System.currentTimeMillis()
        sessionStartEpoch = sessionStart / 1000.0
        track.clear()
        strokeDetector.reset()
        _distanceM.value = 0.0
        _durationSec.value = 0L
        _strokeCount.value = 0
        _strokeRate.value = 0.0
        _heartRate.value = 0
        _isPaused.value = false
        lastSpeedMps = 0.0

        // Start accelerometer for stroke detection (~50 Hz)
        sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)?.let { sensor ->
            sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME)
        }

        startTicker()
        _isRecording.value = true

        // Start HealthServices exercise tracking (GPS + HR + speed)
        scope.launch { startHealthServices() }
    }

    private fun startTicker() {
        durationJob?.cancel()
        durationJob = scope.launch {
            while (isActive) {
                delay(1000)
                if (!_isPaused.value) _durationSec.value++
            }
        }
    }

    private suspend fun startHealthServices() {
        try {
            val client = exerciseClient
            client.setUpdateCallback(exerciseCallback)

            val config = ExerciseConfig.builder(ExerciseType.PADDLING)
                .setDataTypes(setOf(DataType.LOCATION, DataType.HEART_RATE_BPM, DataType.SPEED))
                .setIsAutoPauseAndResumeEnabled(false)
                .build()

            client.startExerciseAsync(config).await()
        } catch (e: Exception) {
            android.util.Log.e("WorkoutManager", "HealthServices start failed: $e")
        }
    }

    // ── Pause / resume ────────────────────────────────────────────────────────

    fun pause() {
        if (!_isRecording.value || _isPaused.value) return
        _isPaused.value = true
        sensorManager.unregisterListener(this)
        scope.launch {
            try { exerciseClient.pauseExerciseAsync().await() } catch (_: Exception) {}
        }
    }

    fun resume() {
        if (!_isRecording.value || !_isPaused.value) return
        _isPaused.value = false
        sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)?.let { sensor ->
            sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME)
        }
        scope.launch {
            try { exerciseClient.resumeExerciseAsync().await() } catch (_: Exception) {}
        }
    }

    // ── Stop ──────────────────────────────────────────────────────────────────

    suspend fun stopAndSave(): WatchSession {
        _isRecording.value = false
        _isPaused.value = false
        durationJob?.cancel()
        sensorManager.unregisterListener(this)

        val endEpoch = System.currentTimeMillis() / 1000.0
        val startIso = epochToIso(sessionStartEpoch)
        val endIso = epochToIso(endEpoch)

        // Fetch weather best-effort
        val weather = track.firstOrNull()?.let { first ->
            WeatherService.fetch(first.lat, first.lon)
        }

        // Compute aggregates
        val totals = Aggregator.totals(track, _strokeCount.value)
        val hr = Aggregator.hrSummary(track)
        val splits = Aggregator.splits(track)
        val trackSummary = Aggregator.downsample(track, 200)

        val session = WatchSession(
            id = sessionId,
            source = "android-wear",
            craftType = currentCraft,
            startedAt = startIso,
            endedAt = endIso,
            totals = totals,
            hr = hr,
            splits = splits,
            weather = weather,
            trackSummary = trackSummary,
        )

        // Stop HealthServices
        try {
            exerciseClient.endExerciseAsync().await()
        } catch (_: Exception) {}

        // Persist + transfer
        TransferManager.transferSession(context, session, track)
        return session
    }

    fun discard() {
        _isRecording.value = false
        _isPaused.value = false
        durationJob?.cancel()
        sensorManager.unregisterListener(this)
        track.clear()
        scope.launch {
            try { exerciseClient.endExerciseAsync().await() } catch (_: Exception) {}
        }
    }

    // ── SensorEventListener (accelerometer at ~50 Hz) ─────────────────────────

    override fun onSensorChanged(event: SensorEvent) {
        if (_isPaused.value) return
        val t = (event.timestamp / 1_000_000_000.0) - (sessionStart / 1000.0)
        val stroke = strokeDetector.onSample(t, event.values[0].toDouble(),
                                               event.values[1].toDouble(),
                                               event.values[2].toDouble())
        stroke?.let {
            _strokeCount.value++
            _strokeRate.value = it.rateSpm
            currentStrokeRate = it.rateSpm
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    // ── Helpers ───────────────────────────────────────────────────────────────

    fun addGpsSample(lat: Double, lon: Double, altM: Double, speedMps: Double) {
        if (_isPaused.value) return
        val t = (System.currentTimeMillis() / 1000.0) - sessionStartEpoch
        val pt = WatchTrackPoint(t = t, lat = lat, lon = lon, altM = altM,
                                  speedMps = max(0.0, speedMps),
                                  hr = if (lastHr > 0) lastHr else null,
                                  strokeRate = if (currentStrokeRate > 0) currentStrokeRate else null)
        track.add(pt)
        if (track.size >= 2) {
            val prev = track[track.size - 2]
            _distanceM.value += haversine(prev.lat, prev.lon, pt.lat, pt.lon)
        }
    }

    fun updateHeartRate(bpm: Int) {
        lastHr = bpm
        _heartRate.value = bpm
    }

    private fun generateId(): String {
        val chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        return (1..21).map { chars.random() }.joinToString("")
    }

    private fun epochToIso(epoch: Double): String =
        DateTimeFormatter.ISO_INSTANT.format(
            Instant.ofEpochSecond(epoch.toLong(), ((epoch % 1) * 1e9).toLong())
        )

    private fun haversine(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val R = 6371000.0
        val φ1 = Math.toRadians(lat1); val φ2 = Math.toRadians(lat2)
        val Δφ = Math.toRadians(lat2 - lat1); val Δλ = Math.toRadians(lon2 - lon1)
        val a = Math.sin(Δφ/2).let { it*it } + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2).let { it*it }
        return R * 2 * Math.atan2(sqrt(a), sqrt(1 - a))
    }
}
