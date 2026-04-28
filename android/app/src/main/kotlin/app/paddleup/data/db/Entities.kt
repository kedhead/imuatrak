package app.paddleup.data.db

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "sessions")
data class SessionEntity(
    @PrimaryKey val id: String,
    val userId: String,
    val craftType: String,
    val source: String,
    val appVersion: String,
    val startedAtEpochMs: Long,
    val endedAtEpochMs: Long,

    val distanceMeters: Double,
    val durationSec: Double,
    val avgPaceSecPerKm: Double,
    val avgSpeedMps: Double,
    val maxSpeedMps: Double,
    val strokeCount: Int,
    val avgStrokeRate: Double,
    val elevationGainM: Double,

    val avgHr: Int,
    val maxHr: Int,

    /** JSON for splits, hr.zones, sideSwitches, weather, trackSummary. */
    val splitsJson: String,
    val hrZonesJson: String,
    val sideSwitchesJson: String,
    val weatherJson: String?,
    val trackSummaryJson: String,

    /** Sync state */
    val synced: Boolean = false,
    val trackStoragePath: String? = null,
    val cardStoragePath: String? = null,
)

@Entity(
    tableName = "track_points",
    foreignKeys = [ForeignKey(
        entity = SessionEntity::class,
        parentColumns = ["id"],
        childColumns = ["sessionId"],
        onDelete = ForeignKey.CASCADE,
    )],
    indices = [Index("sessionId")],
)
data class TrackPointEntity(
    @PrimaryKey(autoGenerate = true) val rowId: Long = 0,
    val sessionId: String,
    val tSec: Double,
    val lat: Double,
    val lon: Double,
    val altM: Double,
    val speedMps: Double,
    val hr: Int?,
    val strokeRate: Double?,
    val cadenceConfidence: Double?,
)
