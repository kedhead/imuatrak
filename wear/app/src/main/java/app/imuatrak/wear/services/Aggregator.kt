package app.imuatrak.wear.services

import app.imuatrak.wear.models.*
import kotlin.math.*

// Mirrors src/services/aggregator.ts — same logic, same results.

object Aggregator {

    fun totals(track: List<WatchTrackPoint>, strokeCount: Int): WatchTotals {
        if (track.size < 2) return WatchTotals.empty()
        var distM = 0.0; var movingDur = 0.0; var maxSpeed = 0.0; var elevGain = 0.0
        for (i in 1 until track.size) {
            val prev = track[i-1]; val cur = track[i]
            val d = haversine(prev.lat, prev.lon, cur.lat, cur.lon)
            distM += d
            val dt = cur.t - prev.t
            if (cur.speedMps > 0.5 || d > 0.5) movingDur += dt
            maxSpeed = max(maxSpeed, cur.speedMps)
            val dAlt = cur.altM - prev.altM
            if (dAlt > 0) elevGain += dAlt
        }
        val dur = track.last().t - track.first().t
        val avgSpeed = if (dur > 0) distM / dur else 0.0
        val avgPace = if (distM > 0) dur / (distM / 1000) else 0.0
        val avgSr = if (dur > 0) strokeCount / (dur / 60) else 0.0
        return WatchTotals(distM, dur, movingDur, avgPace, avgSpeed, maxSpeed, strokeCount, avgSr, 0.0, elevGain)
    }

    fun hrSummary(track: List<WatchTrackPoint>): WatchHrSummary {
        val hrs = track.mapNotNull { it.hr }
        if (hrs.isEmpty()) return WatchHrSummary.empty()
        val zoneBounds = listOf(0, 120, 140, 160, 175, 220)
        val zoneTimes = DoubleArray(5)
        for (i in 1 until track.size) {
            val hr = track[i].hr ?: continue
            val dt = track[i].t - track[i-1].t
            var z = 0
            for (k in zoneBounds.indices) { if (hr >= zoneBounds[k]) z = k }
            zoneTimes[z.coerceIn(0, 4)] += dt
        }
        val avg = hrs.average().toInt()
        val maxHr = hrs.max()
        val bounds = listOf(0 to 120, 120 to 140, 140 to 160, 160 to 175, 175 to 220)
        val zones = bounds.mapIndexed { i, (mn, mx) -> WatchHrZone(i, mn, mx, zoneTimes[i]) }
        return WatchHrSummary(avg, maxHr, zones)
    }

    fun splits(track: List<WatchTrackPoint>): List<WatchSplit> {
        val unitM = 1000.0
        val result = mutableListOf<WatchSplit>()
        var splitStart = 0; var accumulated = 0.0; var index = 0
        val hrs = mutableListOf<Double>(); val srs = mutableListOf<Double>()
        for (i in 1 until track.size) {
            accumulated += haversine(track[i-1].lat, track[i-1].lon, track[i].lat, track[i].lon)
            track[i].hr?.let { hrs.add(it.toDouble()) }
            track[i].strokeRate?.let { srs.add(it) }
            if (accumulated >= unitM) {
                val dur = track[i].t - track[splitStart].t
                result.add(WatchSplit(index++, accumulated, dur,
                    if (hrs.isEmpty()) 0.0 else hrs.average(),
                    if (srs.isEmpty()) 0.0 else srs.average(),
                    if (dur > 0) accumulated / dur else 0.0))
                splitStart = i; accumulated = 0.0; hrs.clear(); srs.clear()
            }
        }
        return result
    }

    fun downsample(track: List<WatchTrackPoint>, maxPoints: Int = 200): List<WatchTrackPoint> {
        if (track.size <= maxPoints) return track
        val step = track.size.toDouble() / maxPoints
        return (0 until maxPoints).map { track[(it * step).toInt()] }
    }

    private fun haversine(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val R = 6371000.0
        val φ1 = Math.toRadians(lat1); val φ2 = Math.toRadians(lat2)
        val Δφ = Math.toRadians(lat2 - lat1); val Δλ = Math.toRadians(lon2 - lon1)
        val a = sin(Δφ/2).pow(2) + cos(φ1)*cos(φ2)*sin(Δλ/2).pow(2)
        return R * 2 * atan2(sqrt(a), sqrt(1-a))
    }
}
