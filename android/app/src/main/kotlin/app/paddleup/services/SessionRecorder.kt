package app.paddleup.services

import app.paddleup.data.db.SessionDao
import app.paddleup.data.db.SessionEntity
import app.paddleup.data.db.TrackPointEntity
import app.paddleup.shared.geo.downsample
import app.paddleup.shared.model.CraftType
import app.paddleup.shared.model.SessionSource
import app.paddleup.shared.model.TrackPoint
import app.paddleup.shared.model.TrackSummaryPoint
import app.paddleup.shared.session.SessionAggregator
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.plus
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

data class LiveStats(
    val isRecording: Boolean = false,
    val startedAtEpochMs: Long = 0,
    val durationSec: Double = 0.0,
    val distanceMeters: Double = 0.0,
    val currentSpeedMps: Double = 0.0,
    val currentHr: Int? = null,
    val currentStrokeRate: Double = 0.0,
    val strokeCount: Int = 0,
)

@Singleton
class SessionRecorder @Inject constructor(
    private val locationTracker: LocationTracker,
    private val motionTracker: MotionTracker,
    private val dao: SessionDao,
    private val auth: FirebaseAuth,
    private val json: Json,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var collectJobs: List<Job> = emptyList()

    private val _live = MutableStateFlow(LiveStats())
    val live: StateFlow<LiveStats> = _live.asStateFlow()

    private val track = mutableListOf<TrackPoint>()
    private var sessionId: String? = null
    private var startEpochMs: Long = 0
    private var lastStrokeRate: Double = 0.0
    private var strokeCount: Int = 0
    private var craftType: CraftType = CraftType.OC1

    fun start(craft: CraftType) {
        if (_live.value.isRecording) return
        craftType = craft
        sessionId = UUID.randomUUID().toString()
        startEpochMs = System.currentTimeMillis()
        track.clear()
        strokeCount = 0
        lastStrokeRate = 0.0
        _live.value = LiveStats(isRecording = true, startedAtEpochMs = startEpochMs)

        collectJobs = listOf(
            scope.launch {
                locationTracker.samples().collect { gps ->
                    val tSec = (gps.tEpochMs - startEpochMs) / 1000.0
                    val point = TrackPoint(
                        t = tSec,
                        lat = gps.lat,
                        lon = gps.lon,
                        altM = gps.altM,
                        speedMps = gps.speedMps,
                        hr = null,
                        strokeRate = if (lastStrokeRate > 0) lastStrokeRate else null,
                    )
                    track += point
                    val totals = SessionAggregator.totals(track, strokeCount)
                    _live.value = _live.value.copy(
                        durationSec = tSec,
                        distanceMeters = totals.distanceMeters,
                        currentSpeedMps = gps.speedMps,
                        currentStrokeRate = lastStrokeRate,
                        strokeCount = strokeCount,
                    )
                }
            },
            scope.launch {
                motionTracker.strokes().collect { stroke ->
                    strokeCount++
                    lastStrokeRate = stroke.rateSpm
                    _live.value = _live.value.copy(
                        currentStrokeRate = stroke.rateSpm,
                        strokeCount = strokeCount,
                    )
                }
            },
        )
    }

    suspend fun stopAndSave(): String? {
        if (!_live.value.isRecording) return null
        collectJobs.forEach { it.cancel() }
        collectJobs = emptyList()
        _live.value = _live.value.copy(isRecording = false)

        val id = sessionId ?: return null
        val uid = auth.currentUser?.uid ?: "anonymous"
        val totals = SessionAggregator.totals(track, strokeCount)
        val splits = SessionAggregator.splits(track)
        val hr = SessionAggregator.hrSummary(track)
        val summary = downsample(track, target = 200).map {
            TrackSummaryPoint(it.t, it.lat, it.lon, it.altM, it.speedMps)
        }

        val entity = SessionEntity(
            id = id,
            userId = uid,
            craftType = craftType.name,
            source = SessionSource.ANDROID_PHONE.name,
            appVersion = "0.1.0",
            startedAtEpochMs = startEpochMs,
            endedAtEpochMs = startEpochMs + (totals.durationSec * 1000).toLong(),
            distanceMeters = totals.distanceMeters,
            durationSec = totals.durationSec,
            avgPaceSecPerKm = totals.avgPaceSecPerKm,
            avgSpeedMps = totals.avgSpeedMps,
            maxSpeedMps = totals.maxSpeedMps,
            strokeCount = totals.strokeCount,
            avgStrokeRate = totals.avgStrokeRate,
            elevationGainM = totals.elevationGainM,
            avgHr = hr.avg,
            maxHr = hr.max,
            splitsJson = json.encodeToString(splits),
            hrZonesJson = json.encodeToString(hr.zones),
            sideSwitchesJson = "[]",
            weatherJson = null,
            trackSummaryJson = json.encodeToString(summary),
        )

        dao.upsertSession(entity)
        dao.insertTrackPoints(
            track.map {
                TrackPointEntity(
                    sessionId = id,
                    tSec = it.t,
                    lat = it.lat,
                    lon = it.lon,
                    altM = it.altM,
                    speedMps = it.speedMps,
                    hr = it.hr,
                    strokeRate = it.strokeRate,
                    cadenceConfidence = it.cadenceConfidence,
                )
            },
        )

        sessionId = null
        return id
    }

    fun discard() {
        collectJobs.forEach { it.cancel() }
        collectJobs = emptyList()
        track.clear()
        sessionId = null
        _live.value = LiveStats()
    }
}
