package app.imuatrak.wear.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ── Session model — mirrors src/models/index.ts exactly ──────────────────────
// Field names must match the TypeScript JSON schema so the phone app can
// deserialise transferred files without any conversion.

@Serializable
data class WatchSession(
    val id: String,
    val userId: String = "",
    val schemaVersion: Int = 1,
    val source: String = "android-wear",
    val appVersion: String = "0.1.0",
    val craftType: String,
    val startedAt: String,
    val endedAt: String,
    val totals: WatchTotals,
    val hr: WatchHrSummary,
    val splits: List<WatchSplit>,
    val sideSwitches: List<WatchSideSwitch> = emptyList(),
    val weather: WatchWeatherSummary? = null,
    val trackSummary: List<WatchTrackPoint>,
    val isPublic: Boolean? = false,
)

@Serializable
data class WatchTotals(
    val distanceMeters: Double,
    val durationSec: Double,
    val movingDurationSec: Double,
    val avgPaceSecPerKm: Double,
    val avgSpeedMps: Double,
    val maxSpeedMps: Double,
    val strokeCount: Int,
    val avgStrokeRate: Double,
    val calories: Double = 0.0,
    val elevationGainM: Double,
) {
    companion object {
        fun empty() = WatchTotals(0.0,0.0,0.0,0.0,0.0,0.0,0,0.0,0.0,0.0)
    }
}

@Serializable
data class WatchHrSummary(
    val avg: Int,
    val max: Int,
    val zones: List<WatchHrZone>,
) {
    companion object {
        fun empty(): WatchHrSummary {
            val bounds = listOf(0 to 120, 120 to 140, 140 to 160, 160 to 175, 175 to 220)
            return WatchHrSummary(0, 0, bounds.mapIndexed { i, (mn, mx) ->
                WatchHrZone(i, mn, mx, 0.0)
            })
        }
    }
}

@Serializable
data class WatchHrZone(val zone: Int, val minBpm: Int, val maxBpm: Int, var timeSec: Double)

@Serializable
data class WatchSplit(
    val index: Int,
    val distanceM: Double,
    val durationSec: Double,
    val avgHr: Double,
    val avgStrokeRate: Double,
    val avgSpeedMps: Double,
)

@Serializable
data class WatchSideSwitch(
    val tSec: Double,
    val detectedSide: String,
    val confidence: Double,
    val source: String,
)

@Serializable
data class WatchTrackPoint(
    val t: Double,
    val lat: Double,
    val lon: Double,
    val altM: Double,
    val speedMps: Double,
    val hr: Int? = null,
    val strokeRate: Double? = null,
    val cadenceConfidence: Double? = null,
)

@Serializable
data class WatchWeatherSummary(val start: WatchWeatherSample, val samples: List<WatchWeatherSample>)

@Serializable
data class WatchWeatherSample(
    val tSec: Double,
    val windMps: Double,
    val windDeg: Double,
    val gustMps: Double,
    val airTempC: Double,
    val pressureHpa: Double,
    val conditions: String? = null,
)
