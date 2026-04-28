import Foundation

public enum Geo {
    /// Haversine distance in meters between two WGS-84 coordinates.
    public static func haversineMeters(_ lat1: Double, _ lon1: Double, _ lat2: Double, _ lon2: Double) -> Double {
        let r = 6_371_000.0
        let φ1 = lat1 * .pi / 180
        let φ2 = lat2 * .pi / 180
        let dφ = (lat2 - lat1) * .pi / 180
        let dλ = (lon2 - lon1) * .pi / 180
        let a = sin(dφ / 2) * sin(dφ / 2) + cos(φ1) * cos(φ2) * sin(dλ / 2) * sin(dλ / 2)
        return 2 * r * asin(min(1.0, sqrt(a)))
    }

    /// Stride-based downsample to at most `target` items.
    public static func downsample<T>(_ points: [T], target: Int) -> [T] {
        guard points.count > target, target > 0 else { return points }
        let step = Double(points.count) / Double(target)
        var out = (0..<target).map { points[Int(Double($0) * step)] }
        if let last = points.last { out.append(last) }
        return out
    }
}
