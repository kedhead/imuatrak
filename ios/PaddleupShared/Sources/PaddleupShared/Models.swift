import Foundation

public let schemaVersion = 1

public enum CraftType: String, Codable, CaseIterable, Sendable {
    case OC1, OC2, OC6, V1, SUP, SURFSKI, OTHER
}

public enum SessionSource: String, Codable, Sendable {
    case iosPhone     = "ios-phone"
    case iosWatch     = "ios-watch"
    case androidPhone = "android-phone"
    case androidWear  = "android-wear"
}

public struct Totals: Codable, Sendable {
    public var distanceMeters: Double
    public var durationSec: Double
    public var movingDurationSec: Double
    public var avgPaceSecPerKm: Double
    public var avgSpeedMps: Double
    public var maxSpeedMps: Double
    public var strokeCount: Int
    public var avgStrokeRate: Double
    public var calories: Double
    public var elevationGainM: Double

    public init(
        distanceMeters: Double = 0,
        durationSec: Double = 0,
        movingDurationSec: Double = 0,
        avgPaceSecPerKm: Double = 0,
        avgSpeedMps: Double = 0,
        maxSpeedMps: Double = 0,
        strokeCount: Int = 0,
        avgStrokeRate: Double = 0,
        calories: Double = 0,
        elevationGainM: Double = 0
    ) {
        self.distanceMeters = distanceMeters
        self.durationSec = durationSec
        self.movingDurationSec = movingDurationSec
        self.avgPaceSecPerKm = avgPaceSecPerKm
        self.avgSpeedMps = avgSpeedMps
        self.maxSpeedMps = maxSpeedMps
        self.strokeCount = strokeCount
        self.avgStrokeRate = avgStrokeRate
        self.calories = calories
        self.elevationGainM = elevationGainM
    }
}

public struct HrZone: Codable, Sendable {
    public var zone: Int
    public var minBpm: Int
    public var maxBpm: Int
    public var timeSec: Double
    public init(zone: Int, minBpm: Int, maxBpm: Int, timeSec: Double) {
        self.zone = zone; self.minBpm = minBpm; self.maxBpm = maxBpm; self.timeSec = timeSec
    }
}

public struct HrSummary: Codable, Sendable {
    public var avg: Int
    public var max: Int
    public var zones: [HrZone]
    public init(avg: Int = 0, max: Int = 0, zones: [HrZone] = []) {
        self.avg = avg; self.max = max; self.zones = zones
    }
}

public struct Split: Codable, Sendable {
    public var index: Int
    public var distanceM: Double
    public var durationSec: Double
    public var avgHr: Int
    public var avgStrokeRate: Double
    public var avgSpeedMps: Double
}

public struct SideSwitch: Codable, Sendable {
    public var tSec: Double
    public var detectedSide: String   // "L" | "R"
    public var confidence: Double
    public var source: String         // "audio" | "manual"
}

public struct WeatherSample: Codable, Sendable {
    public var tSec: Double
    public var windMps: Double
    public var windDeg: Double
    public var gustMps: Double
    public var airTempC: Double
    public var pressureHpa: Double
    public var conditions: String?
}

public struct WeatherSummary: Codable, Sendable {
    public var start: WeatherSample
    public var samples: [WeatherSample]
}

public struct TrackSummaryPoint: Codable, Sendable {
    public var t: Double
    public var lat: Double
    public var lon: Double
    public var altM: Double
    public var speedMps: Double
}

public struct TrackPoint: Codable, Sendable {
    public var t: Double
    public var lat: Double
    public var lon: Double
    public var altM: Double
    public var speedMps: Double
    public var hr: Int?
    public var strokeRate: Double?
    public var cadenceConfidence: Double?

    public init(
        t: Double, lat: Double, lon: Double, altM: Double, speedMps: Double,
        hr: Int? = nil, strokeRate: Double? = nil, cadenceConfidence: Double? = nil
    ) {
        self.t = t; self.lat = lat; self.lon = lon; self.altM = altM; self.speedMps = speedMps
        self.hr = hr; self.strokeRate = strokeRate; self.cadenceConfidence = cadenceConfidence
    }
}

public struct Session: Codable, Sendable {
    public var id: String
    public var userId: String
    public var schemaVersion: Int = PaddleupShared.schemaVersion
    public var source: SessionSource
    public var appVersion: String
    public var craftType: CraftType
    public var startedAt: String
    public var endedAt: String
    public var totals: Totals
    public var hr: HrSummary
    public var splits: [Split]
    public var sideSwitches: [SideSwitch]
    public var weather: WeatherSummary?
    public var trackSummary: [TrackSummaryPoint]
    public var trackStoragePath: String?
    public var fitStoragePath: String?
    public var cardStoragePath: String?

    public init(
        id: String, userId: String, source: SessionSource, appVersion: String,
        craftType: CraftType, startedAt: String, endedAt: String,
        totals: Totals, hr: HrSummary = HrSummary(),
        splits: [Split] = [], sideSwitches: [SideSwitch] = [],
        weather: WeatherSummary? = nil, trackSummary: [TrackSummaryPoint] = [],
        trackStoragePath: String? = nil, fitStoragePath: String? = nil, cardStoragePath: String? = nil
    ) {
        self.id = id; self.userId = userId; self.source = source; self.appVersion = appVersion
        self.craftType = craftType; self.startedAt = startedAt; self.endedAt = endedAt
        self.totals = totals; self.hr = hr; self.splits = splits; self.sideSwitches = sideSwitches
        self.weather = weather; self.trackSummary = trackSummary
        self.trackStoragePath = trackStoragePath
        self.fitStoragePath = fitStoragePath
        self.cardStoragePath = cardStoragePath
    }
}
