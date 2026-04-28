package app.paddleup.services

import android.annotation.SuppressLint
import android.content.Context
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import javax.inject.Inject
import javax.inject.Singleton

data class GpsSample(
    val tEpochMs: Long,
    val lat: Double,
    val lon: Double,
    val altM: Double,
    val speedMps: Double,
    val accuracyM: Float,
)

@Singleton
class LocationTracker @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val client = LocationServices.getFusedLocationProviderClient(context)

    /** Callers must hold ACCESS_FINE_LOCATION before subscribing. */
    @SuppressLint("MissingPermission")
    fun samples(): Flow<GpsSample> = callbackFlow {
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1_000L)
            .setMinUpdateIntervalMillis(500L)
            .setMinUpdateDistanceMeters(0.5f)
            .setWaitForAccurateLocation(true)
            .build()

        val cb = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                for (loc in result.locations) {
                    trySend(
                        GpsSample(
                            tEpochMs = loc.time,
                            lat = loc.latitude,
                            lon = loc.longitude,
                            altM = if (loc.hasAltitude()) loc.altitude else 0.0,
                            speedMps = if (loc.hasSpeed()) loc.speed.toDouble() else 0.0,
                            accuracyM = loc.accuracy,
                        ),
                    )
                }
            }
        }

        client.requestLocationUpdates(request, cb, context.mainLooper)
        awaitClose { client.removeLocationUpdates(cb) }
    }
}
