package app.paddleup.services

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import app.paddleup.data.db.SessionDao
import app.paddleup.data.db.SessionEntity
import app.paddleup.shared.gpx.GpxExporter
import app.paddleup.shared.model.CraftType
import app.paddleup.shared.model.HrSummary
import app.paddleup.shared.model.HrZone
import app.paddleup.shared.model.Session
import app.paddleup.shared.model.SessionSource
import app.paddleup.shared.model.Split
import app.paddleup.shared.model.TrackPoint
import app.paddleup.shared.model.TrackSummaryPoint
import app.paddleup.shared.model.Totals
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.storage.FirebaseStorage
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.tasks.await
import kotlinx.datetime.Instant
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json

@HiltWorker
class FirebaseSyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val dao: SessionDao,
    private val auth: FirebaseAuth,
    private val firestore: FirebaseFirestore,
    private val storage: FirebaseStorage,
    private val json: Json,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result = runCatching {
        val uid = auth.currentUser?.uid ?: return Result.retry()
        val pending = dao.unsynced()
        for (entity in pending) {
            val track = dao.getTrack(entity.id).map { tp ->
                TrackPoint(
                    t = tp.tSec, lat = tp.lat, lon = tp.lon, altM = tp.altM,
                    speedMps = tp.speedMps, hr = tp.hr, strokeRate = tp.strokeRate,
                    cadenceConfidence = tp.cadenceConfidence,
                )
            }

            val session = entityToSession(entity, track, uid)
            val gpx = GpxExporter.toGpx(session, track)
            val storagePath = "users/$uid/tracks/${entity.id}.gpx"
            storage.reference.child(storagePath)
                .putBytes(gpx.toByteArray())
                .await()

            firestore.collection("users").document(uid)
                .collection("sessions").document(entity.id)
                .set(session.copy(trackStoragePath = storagePath))
                .await()

            dao.markSynced(entity.id, storagePath)
        }
        Result.success()
    }.getOrElse {
        Result.retry()
    }

    private fun entityToSession(e: SessionEntity, track: List<TrackPoint>, uid: String): Session {
        val splits: List<Split> = json.decodeFromString(e.splitsJson)
        val zones: List<HrZone> = json.decodeFromString(e.hrZonesJson)
        val summary: List<TrackSummaryPoint> = json.decodeFromString(e.trackSummaryJson)
        return Session(
            id = e.id,
            userId = uid,
            source = SessionSource.ANDROID_PHONE,
            appVersion = e.appVersion,
            craftType = CraftType.valueOf(e.craftType),
            startedAt = Instant.fromEpochMilliseconds(e.startedAtEpochMs).toString(),
            endedAt = Instant.fromEpochMilliseconds(e.endedAtEpochMs).toString(),
            totals = Totals(
                distanceMeters = e.distanceMeters,
                durationSec = e.durationSec,
                avgPaceSecPerKm = e.avgPaceSecPerKm,
                avgSpeedMps = e.avgSpeedMps,
                maxSpeedMps = e.maxSpeedMps,
                strokeCount = e.strokeCount,
                avgStrokeRate = e.avgStrokeRate,
                elevationGainM = e.elevationGainM,
            ),
            hr = HrSummary(avg = e.avgHr, max = e.maxHr, zones = zones),
            splits = splits,
            trackSummary = summary,
        )
    }
}
