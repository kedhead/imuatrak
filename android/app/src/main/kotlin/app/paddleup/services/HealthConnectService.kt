package app.paddleup.services

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.ExerciseSessionRecord.Companion.EXERCISE_TYPE_PADDLING
import androidx.health.connect.client.records.metadata.Metadata
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toJavaInstant
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class HealthConnectService @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val client by lazy {
        if (HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE) {
            HealthConnectClient.getOrCreate(context)
        } else null
    }

    val requiredPermissions = setOf(
        HealthPermission.getWritePermission(ExerciseSessionRecord::class),
    )

    suspend fun grantedPermissions(): Set<String> =
        client?.permissionController?.getGrantedPermissions() ?: emptySet()

    /** Writes a paddling exercise session. Returns true on success. */
    suspend fun writePaddlingSession(
        startedAt: Instant,
        endedAt: Instant,
        title: String,
    ): Boolean {
        val c = client ?: return false
        val record = ExerciseSessionRecord(
            startTime = startedAt.toJavaInstant(),
            startZoneOffset = TimeZone.currentSystemDefault().offsetAt(startedAt).toJavaZoneOffset(),
            endTime = endedAt.toJavaInstant(),
            endZoneOffset = TimeZone.currentSystemDefault().offsetAt(endedAt).toJavaZoneOffset(),
            exerciseType = EXERCISE_TYPE_PADDLING,
            title = title,
            metadata = Metadata.manualEntry(),
        )
        c.insertRecords(listOf(record))
        return true
    }

    private fun kotlinx.datetime.UtcOffset.toJavaZoneOffset(): java.time.ZoneOffset =
        java.time.ZoneOffset.ofTotalSeconds(this.totalSeconds)
}
