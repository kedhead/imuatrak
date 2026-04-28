import Foundation

public enum SessionAggregator {

    private static let defaultZoneBounds = [0, 120, 140, 160, 175, 1000]

    public static func totals(points: [TrackPoint], strokeCount: Int) -> Totals {
        guard points.count >= 2 else {
            return Totals(strokeCount: strokeCount)
        }
        var dist = 0.0
        var maxSpeed = 0.0
        var elevGain = 0.0
        for i in 1..<points.count {
            let a = points[i - 1], b = points[i]
            dist += Geo.haversineMeters(a.lat, a.lon, b.lat, b.lon)
            if b.speedMps > maxSpeed { maxSpeed = b.speedMps }
            let rise = b.altM - a.altM
            if rise > 0 { elevGain += rise }
        }
        let durationSec = points.last!.t - points.first!.t
        var movingSec = 0.0
        for i in 1..<points.count {
            let a = points[i - 1], b = points[i]
            if b.speedMps > 0.5 || Geo.haversineMeters(a.lat, a.lon, b.lat, b.lon) > 0.5 {
                movingSec += b.t - a.t
            }
        }
        let avgSpeed = durationSec > 0 ? dist / durationSec : 0
        let avgPace  = avgSpeed > 0 ? 1000.0 / avgSpeed : 0
        let avgRate  = durationSec > 0 ? Double(strokeCount) * 60.0 / durationSec : 0
        return Totals(
            distanceMeters: dist,
            durationSec: durationSec,
            movingDurationSec: movingSec,
            avgPaceSecPerKm: avgPace,
            avgSpeedMps: avgSpeed,
            maxSpeedMps: maxSpeed,
            strokeCount: strokeCount,
            avgStrokeRate: avgRate,
            calories: 0,
            elevationGainM: elevGain
        )
    }

    public static func splits(points: [TrackPoint], imperial: Bool = false) -> [Split] {
        guard points.count >= 2 else { return [] }
        let unit: Double = imperial ? 1609.344 : 1000.0
        var out: [Split] = []
        var splitDist = 0.0
        var splitStartT = points.first!.t
        var splitHrSum = 0.0
        var splitHrSamples = 0
        var idx = 1

        for i in 1..<points.count {
            let a = points[i - 1], b = points[i]
            let seg = Geo.haversineMeters(a.lat, a.lon, b.lat, b.lon)
            splitDist += seg
            if let hr = b.hr { splitHrSum += Double(hr); splitHrSamples += 1 }
            if splitDist >= unit {
                let dur = b.t - splitStartT
                out.append(Split(
                    index: idx,
                    distanceM: unit,
                    durationSec: dur,
                    avgHr: splitHrSamples > 0 ? Int(splitHrSum / Double(splitHrSamples)) : 0,
                    avgStrokeRate: 0,
                    avgSpeedMps: dur > 0 ? unit / dur : 0
                ))
                idx += 1
                splitDist = 0
                splitStartT = b.t
                splitHrSum = 0
                splitHrSamples = 0
            }
        }
        return out
    }

    public static func hrSummary(points: [TrackPoint], zoneBounds: [Int] = defaultZoneBounds) -> HrSummary {
        precondition(zoneBounds.count == 6, "zoneBounds must have length 6")
        let hrs = points.compactMap { $0.hr }
        guard !hrs.isEmpty else { return HrSummary() }
        var zoneTimes = Array(repeating: 0.0, count: 5)
        for i in 1..<points.count {
            guard let hr = points[i].hr else { continue }
            let dt = points[i].t - points[i - 1].t
            let z = max(0, min(4, zoneBounds.lastIndex(where: { hr >= $0 }) ?? 0))
            zoneTimes[z] += dt
        }
        let avg = hrs.reduce(0, +) / hrs.count
        let mx = hrs.max() ?? 0
        let zones = (0..<5).map { i in
            HrZone(zone: i + 1, minBpm: zoneBounds[i], maxBpm: zoneBounds[i + 1] - 1, timeSec: zoneTimes[i])
        }
        return HrSummary(avg: avg, max: mx, zones: zones)
    }
}
