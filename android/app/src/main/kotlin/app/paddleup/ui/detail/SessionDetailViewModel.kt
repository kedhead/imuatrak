package app.paddleup.ui.detail

import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import androidx.lifecycle.ViewModel
import app.paddleup.data.db.SessionDao
import app.paddleup.data.db.SessionEntity
import app.paddleup.shared.gpx.GpxExporter
import app.paddleup.shared.model.CraftType
import app.paddleup.shared.model.Session
import app.paddleup.shared.model.SessionSource
import app.paddleup.shared.model.Totals
import app.paddleup.shared.model.TrackPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.File
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.Instant

@HiltViewModel
class SessionDetailViewModel @Inject constructor(
    private val dao: SessionDao,
) : ViewModel() {

    private val _state = MutableStateFlow<SessionEntity?>(null)
    val state: StateFlow<SessionEntity?> = _state.asStateFlow()

    suspend fun load(id: String) {
        _state.value = dao.getById(id)
    }

    /** Writes the GPX to the cache dir and returns a content:// URI for sharing. */
    suspend fun exportGpx(id: String, context: Context): Uri? {
        val entity = dao.getById(id) ?: return null
        val track = dao.getTrack(id).map { tp ->
            TrackPoint(
                t = tp.tSec, lat = tp.lat, lon = tp.lon, altM = tp.altM,
                speedMps = tp.speedMps, hr = tp.hr, strokeRate = tp.strokeRate,
            )
        }
        val session = Session(
            id = entity.id,
            userId = entity.userId,
            source = SessionSource.ANDROID_PHONE,
            appVersion = entity.appVersion,
            craftType = CraftType.valueOf(entity.craftType),
            startedAt = Instant.fromEpochMilliseconds(entity.startedAtEpochMs).toString(),
            endedAt = Instant.fromEpochMilliseconds(entity.endedAtEpochMs).toString(),
            totals = Totals(
                distanceMeters = entity.distanceMeters,
                durationSec = entity.durationSec,
                avgSpeedMps = entity.avgSpeedMps,
                strokeCount = entity.strokeCount,
                avgStrokeRate = entity.avgStrokeRate,
            ),
        )
        val gpx = GpxExporter.toGpx(session, track)
        val dir = File(context.cacheDir, "exports").apply { mkdirs() }
        val file = File(dir, "paddleup-${entity.id}.gpx").apply { writeText(gpx) }
        return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    }
}
