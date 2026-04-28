package app.paddleup.shared.geo

import kotlin.math.*

/** Haversine distance in meters between two WGS-84 coordinates. */
fun haversineMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val r = 6_371_000.0
    val φ1 = Math.toRadians(lat1)
    val φ2 = Math.toRadians(lat2)
    val dφ = Math.toRadians(lat2 - lat1)
    val dλ = Math.toRadians(lon2 - lon1)
    val a = sin(dφ / 2).pow(2.0) + cos(φ1) * cos(φ2) * sin(dλ / 2).pow(2.0)
    return 2 * r * asin(min(1.0, sqrt(a)))
}

/**
 * Downsample a track to at most [target] points using the
 * Ramer-Douglas-Peucker style stride approach. Cheap and good enough for
 * a list-preview map snapshot.
 */
fun <T> downsample(points: List<T>, target: Int): List<T> {
    if (points.size <= target) return points
    val step = points.size.toDouble() / target
    return (0 until target).map { points[(it * step).toInt()] } + points.last()
}
