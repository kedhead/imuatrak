package app.paddleup.shared.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

const val SCHEMA_VERSION = 1

@Serializable
enum class CraftType {
    OC1, OC2, OC6, V1, SUP, SURFSKI, OTHER
}

@Serializable
enum class SessionSource {
    @SerialName("ios-phone")    IOS_PHONE,
    @SerialName("ios-watch")    IOS_WATCH,
    @SerialName("android-phone") ANDROID_PHONE,
    @SerialName("android-wear") ANDROID_WEAR,
}

@Serializable
data class Totals(
    val distanceMeters: Double = 0.0,
    val durationSec: Double = 0.0,
    val movingDurationSec: Double = 0.0,
    val avgPaceSecPerKm: Double = 0.0,
    val avgSpeedMps: Double = 0.0,
    val maxSpeedMps: Double = 0.0,
    val strokeCount: Int = 0,
    val avgStrokeRate: Double = 0.0,
    val calories: Double = 0.0,
    val elevationGainM: Double = 0.0,
)

@Serializable
data class HrZone(val zone: Int, val minBpm: Int, val maxBpm: Int, val timeSec: Double)

@Serializable
data class HrSummary(val avg: Int = 0, val max: Int = 0, val zones: List<HrZone> = emptyList())

@Serializable
data class Split(
    val index: Int,
    val distanceM: Double,
    val durationSec: Double,
    val avgHr: Int,
    val avgStrokeRate: Double,
    val avgSpeedMps: Double,
)

@Serializable
data class SideSwitch(
    val tSec: Double,
    val detectedSide: String,         // "L" | "R"
    val confidence: Double,
    val source: String,               // "audio" | "manual"
)

@Serializable
data class WeatherSample(
    val tSec: Double,
    val windMps: Double,
    val windDeg: Double,
    val gustMps: Double,
    val airTempC: Double,
    val pressureHpa: Double,
    val conditions: String? = null,
)

@Serializable
data class WeatherSummary(
    val start: WeatherSample,
    val samples: List<WeatherSample> = emptyList(),
)

@Serializable
data class TrackSummaryPoint(
    val t: Double,
    val lat: Double,
    val lon: Double,
    val altM: Double,
    val speedMps: Double,
)

@Serializable
data class TrackPoint(
    val t: Double,                    // seconds since session start
    val lat: Double,
    val lon: Double,
    val altM: Double,
    val speedMps: Double,
    val hr: Int? = null,
    val strokeRate: Double? = null,
    val cadenceConfidence: Double? = null,
)

@Serializable
data class Session(
    val id: String,
    val userId: String,
    val schemaVersion: Int = SCHEMA_VERSION,
    val source: SessionSource,
    val appVersion: String,
    val craftType: CraftType,
    val startedAt: String,            // ISO-8601
    val endedAt: String,              // ISO-8601
    val totals: Totals,
    val hr: HrSummary = HrSummary(),
    val splits: List<Split> = emptyList(),
    val sideSwitches: List<SideSwitch> = emptyList(),
    val weather: WeatherSummary? = null,
    val trackSummary: List<TrackSummaryPoint> = emptyList(),
    val trackStoragePath: String? = null,
    val fitStoragePath: String? = null,
    val cardStoragePath: String? = null,
)
