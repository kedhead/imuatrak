import Foundation
import CoreLocation

// ── Aggregator.swift ──────────────────────────────────────────────────────────
// Computes WatchTotals, WatchHrSummary, and WatchSplit[] from a raw track.
// Logic mirrors src/services/aggregator.ts exactly.

enum Aggregator {

    static func totals(_ track: [WatchTrackPoint], strokeCount: Int) -> WatchTotals {
        guard track.count >= 2 else { return .empty() }

        var distanceM = 0.0
        var movingDurationSec = 0.0
        var maxSpeedMps = 0.0
        var elevGain = 0.0

        for i in 1..<track.count {
            let prev = track[i-1], cur = track[i]
            let d = haversine(lat1: prev.lat, lon1: prev.lon, lat2: cur.lat, lon2: cur.lon)
            distanceM += d
            let dt = cur.t - prev.t
            if cur.speedMps > 0.5 || d > 0.5 { movingDurationSec += dt }
            maxSpeedMps = max(maxSpeedMps, cur.speedMps)
            let dAlt = cur.altM - prev.altM
            if dAlt > 0 { elevGain += dAlt }
        }

        let durationSec = track.last!.t - track.first!.t
        let avgSpeedMps = durationSec > 0 ? distanceM / durationSec : 0
        let avgPace = distanceM > 0 ? (durationSec / (distanceM / 1000)) : 0
        let avgStrokeRate = durationSec > 0 ? Double(strokeCount) / (durationSec / 60) : 0

        return WatchTotals(
            distanceMeters: distanceM,
            durationSec: durationSec,
            movingDurationSec: movingDurationSec,
            avgPaceSecPerKm: avgPace,
            avgSpeedMps: avgSpeedMps,
            maxSpeedMps: maxSpeedMps,
            strokeCount: strokeCount,
            avgStrokeRate: avgStrokeRate,
            calories: 0,
            elevationGainM: elevGain
        )
    }

    static func hrSummary(_ track: [WatchTrackPoint]) -> WatchHrSummary {
        let hrs = track.compactMap { $0.hr }
        guard !hrs.isEmpty else { return .empty() }

        let zoneBounds = [0, 120, 140, 160, 175, 220]
        var zoneTimes = [Double](repeating: 0, count: 5)
        for i in 1..<track.count {
            guard let hr = track[i].hr else { continue }
            let dt = track[i].t - track[i-1].t
            var z = 0
            for k in 0..<zoneBounds.count { if hr >= zoneBounds[k] { z = k } }
            z = max(0, min(4, z))
            zoneTimes[z] += dt
        }

        let avg = Int(hrs.reduce(0, +) / hrs.count)
        let maxHr = hrs.max() ?? 0
        let bounds = [(0,120),(120,140),(140,160),(160,175),(175,220)]
        let zones = bounds.enumerated().map { i, b in
            WatchHrZone(zone: i, minBpm: b.0, maxBpm: b.1, timeSec: zoneTimes[i])
        }
        return WatchHrSummary(avg: avg, max: maxHr, zones: zones)
    }

    static func splits(_ track: [WatchTrackPoint], imperial: Bool = false) -> [WatchSplit] {
        let unitM: Double = imperial ? 1609.344 : 1000.0
        var splits: [WatchSplit] = []
        var splitStart = 0
        var accumulated = 0.0
        var splitHrs: [Double] = []
        var splitStrokes: [Double] = []
        var index = 0

        for i in 1..<track.count {
            let d = haversine(lat1: track[i-1].lat, lon1: track[i-1].lon,
                              lat2: track[i].lat, lon2: track[i].lon)
            accumulated += d
            if let hr = track[i].hr { splitHrs.append(Double(hr)) }
            if let sr = track[i].strokeRate { splitStrokes.append(sr) }

            if accumulated >= unitM {
                let dur = track[i].t - track[splitStart].t
                let avgHr = splitHrs.isEmpty ? 0.0 : splitHrs.reduce(0,+)/Double(splitHrs.count)
                let avgSr = splitStrokes.isEmpty ? 0.0 : splitStrokes.reduce(0,+)/Double(splitStrokes.count)
                let avgSpd = dur > 0 ? accumulated / dur : 0
                splits.append(WatchSplit(index: index, distanceM: accumulated,
                                        durationSec: dur, avgHr: avgHr,
                                        avgStrokeRate: avgSr, avgSpeedMps: avgSpd))
                index += 1
                splitStart = i
                accumulated = 0
                splitHrs = []
                splitStrokes = []
            }
        }
        return splits
    }

    /// Ramer-Douglas-Peucker downsampling to ≤maxPoints track summary points.
    static func downsample(_ track: [WatchTrackPoint], maxPoints: Int = 200) -> [WatchTrackPoint] {
        guard track.count > maxPoints else { return track }
        let step = Double(track.count) / Double(maxPoints)
        return (0..<maxPoints).map { i in track[Int(Double(i) * step)] }
    }

    // Haversine distance in metres between two WGS-84 coordinates
    private static func haversine(lat1: Double, lon1: Double, lat2: Double, lon2: Double) -> Double {
        let R = 6371000.0
        let φ1 = lat1 * .pi / 180, φ2 = lat2 * .pi / 180
        let Δφ = (lat2 - lat1) * .pi / 180
        let Δλ = (lon2 - lon1) * .pi / 180
        let a = sin(Δφ/2)*sin(Δφ/2) + cos(φ1)*cos(φ2)*sin(Δλ/2)*sin(Δλ/2)
        return R * 2 * atan2(a.squareRoot(), (1-a).squareRoot())
    }
}
