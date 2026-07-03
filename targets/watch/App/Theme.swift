import SwiftUI

// ── Theme.swift ───────────────────────────────────────────────────────────────
// Watch-side mirror of the phone design system (src/ui/theme.ts): the "ocean /
// island energy" palette, per-craft accent colors, and units-aware formatters.

extension Color {
    init(hex: UInt) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }

    static let imuaOceanDeep = Color(hex: 0x07314F)
    static let imuaOcean = Color(hex: 0x0E5FA5)
    static let imuaOceanLight = Color(hex: 0x2E86C1)
    static let imuaAqua = Color(hex: 0x19C3C9)
    static let imuaSeafoam = Color(hex: 0x7BE0CF)
    static let imuaCoral = Color(hex: 0xFF6B5E)
    static let imuaSunset = Color(hex: 0xFF8A4C)
    static let imuaGold = Color(hex: 0xFFC24B)
    static let imuaMuted = Color(hex: 0x6B7785)
}

/// Same craft → color mapping as craftColors in src/ui/theme.ts.
func craftColor(_ craft: String) -> Color {
    switch craft {
    case "OC1": return .imuaAqua
    case "OC2": return .imuaOceanLight
    case "OC6": return .imuaOcean
    case "V1": return .imuaSeafoam
    case "SUP": return .imuaGold
    case "SURFSKI": return .imuaCoral
    default: return .imuaMuted
    }
}

// ── Units-aware formatting ────────────────────────────────────────────────────
// The phone app pushes the user's units preference ("metric" | "imperial")
// via WCSession application context; TransferManager stores it in
// UserDefaults under "units". Stored session data stays metric — only the
// on-watch display converts.

enum Fmt {
    static let metersPerMile = 1609.344

    static var isImperial: Bool {
        UserDefaults.standard.string(forKey: "units") == "imperial"
    }

    /// "3.42" — distance in the display unit, two decimals.
    static func distanceValue(_ meters: Double) -> String {
        let value = isImperial ? meters / metersPerMile : meters / 1000
        return String(format: "%.2f", value)
    }

    static var distanceUnit: String { isImperial ? "MI" : "KM" }

    /// "6:24 /km" or "10:18 /mi"; em dash until there's enough distance.
    static func pace(distanceM: Double, durationSec: Double) -> String {
        guard distanceM > 50 else { return "—" }
        let unitMeters = isImperial ? metersPerMile : 1000
        let secPerUnit = durationSec / (distanceM / unitMeters)
        let m = Int(secPerUnit) / 60, s = Int(secPerUnit) % 60
        return String(format: "%d:%02d /%@", m, s, isImperial ? "mi" : "km")
    }

    static func duration(_ sec: Double) -> String {
        let s = Int(sec)
        let h = s / 3600, m = (s % 3600) / 60, r = s % 60
        if h > 0 { return String(format: "%d:%02d:%02d", h, m, r) }
        return String(format: "%d:%02d", m, r)
    }
}
