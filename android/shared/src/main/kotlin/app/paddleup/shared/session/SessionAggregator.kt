package app.paddleup.shared.session

import app.paddleup.shared.geo.haversineMeters
import app.paddleup.shared.model.HrSummary
import app.paddleup.shared.model.HrZone
import app.paddleup.shared.model.Split
import app.paddleup.shared.model.Totals
import app.paddleup.shared.model.TrackPoint

/**
 * Computes Session totals + splits + HR summary from a finished list of
 * track points and stroke events. Pure function — no side effects.
 */
object SessionAggregator {

    private val DEFAULT_ZONE_BOUNDS = listOf(0, 120, 140, 160, 175, 1000)

    fun totals(points: List<TrackPoint>, strokeCount: Int): Totals {
        if (points.size < 2) return Totals(strokeCount = strokeCount)
        var dist = 0.0
        var maxSpeed = 0.0
        var elevGain = 0.0
        for (i in 1 until points.size) {
            val a = points[i - 1]
            val b = points[i]
            dist += haversineMeters(a.lat, a.lon, b.lat, b.lon)
            if (b.speedMps > maxSpeed) maxSpeed = b.speedMps
            val rise = b.altM - a.altM
            if (rise > 0) elevGain += rise
        }
        val durationSec = points.last().t - points.first().t
        val movingPoints = points.zipWithNext().filter { (a, b) -> b.speedMps > 0.5 || haversineMeters(a.lat, a.lon, b.lat, b.lon) > 0.5 }
        val movingSec = movingPoints.sumOf { (a, b) -> b.t - a.t }
        val avgSpeed = if (durationSec > 0) dist / durationSec else 0.0
        val avgPace = if (avgSpeed > 0) 1000.0 / avgSpeed else 0.0
        val avgRate = if (durationSec > 0) (strokeCount * 60.0) / durationSec else 0.0
        return Totals(
            distanceMeters = dist,
            durationSec = durationSec,
            movingDurationSec = movingSec,
            avgPaceSecPerKm = avgPace,
            avgSpeedMps = avgSpeed,
            maxSpeedMps = maxSpeed,
            strokeCount = strokeCount,
            avgStrokeRate = avgRate,
            calories = 0.0,
            elevationGainM = elevGain,
        )
    }

    /** 1 km splits (or 1 mi when [imperial] is true). */
    fun splits(points: List<TrackPoint>, imperial: Boolean = false): List<Split> {
        if (points.size < 2) return emptyList()
        val unit = if (imperial) 1609.344 else 1000.0
        val out = mutableListOf<Split>()
        var dist = 0.0
        var splitDist = 0.0
        var splitStartT = points.first().t
        var splitHrSum = 0.0
        var splitHrSamples = 0
        var idx = 1

        for (i in 1 until points.size) {
            val a = points[i - 1]; val b = points[i]
            val seg = haversineMeters(a.lat, a.lon, b.lat, b.lon)
            dist += seg; splitDist += seg
            b.hr?.let { splitHrSum += it; splitHrSamples++ }
            if (splitDist >= unit) {
                val splitDur = b.t - splitStartT
                out += Split(
                    index = idx++,
                    distanceM = unit,
                    durationSec = splitDur,
                    avgHr = if (splitHrSamples > 0) (splitHrSum / splitHrSamples).toInt() else 0,
                    avgStrokeRate = 0.0,
                    avgSpeedMps = if (splitDur > 0) unit / splitDur else 0.0,
                )
                splitDist = 0.0; splitStartT = b.t
                splitHrSum = 0.0; splitHrSamples = 0
            }
        }
        return out
    }

    /** HR zones using either user bounds (length 6) or sensible defaults. */
    fun hrSummary(points: List<TrackPoint>, zoneBounds: List<Int> = DEFAULT_ZONE_BOUNDS): HrSummary {
        require(zoneBounds.size == 6) { "zoneBounds must have length 6" }
        val hrs = points.mapNotNull { it.hr }
        if (hrs.isEmpty()) return HrSummary()

        val zoneTimes = DoubleArray(5)
        for (i in 1 until points.size) {
            val hr = points[i].hr ?: continue
            val dt = points[i].t - points[i - 1].t
            val z = zoneBounds.indexOfLast { hr >= it }.coerceIn(0, 4)
            zoneTimes[z] += dt
        }
        return HrSummary(
            avg = (hrs.average()).toInt(),
            max = hrs.max(),
            zones = (0 until 5).map {
                HrZone(it + 1, zoneBounds[it], zoneBounds[it + 1] - 1, zoneTimes[it])
            },
        )
    }
}
