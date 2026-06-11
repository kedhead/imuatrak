import Foundation

// ── WeatherService.swift ──────────────────────────────────────────────────────
// Calls the same fetchWeather Cloud Function used by the phone app.
// Callable function REST format: POST with {"data": {"lat": x, "lon": y}}

struct WeatherResponse: Codable {
    let result: WeatherResult
    struct WeatherResult: Codable {
        let windMps: Double
        let windDeg: Double
        let gustMps: Double
        let airTempC: Double
        let pressureHpa: Double
        let conditions: String?
    }
}

enum WeatherService {
    static func fetch(lat: Double, lon: Double) async -> WatchWeatherSummary? {
        var request = URLRequest(url: FunctionsConfig.url(for: "fetchWeather"), timeoutInterval: 5)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "data": ["lat": lat, "lon": lon]
        ])

        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            let resp = try JSONDecoder().decode(WeatherResponse.self, from: data)
            let r = resp.result
            let sample = WatchWeatherSample(tSec: 0, windMps: r.windMps, windDeg: r.windDeg,
                                            gustMps: r.gustMps, airTempC: r.airTempC,
                                            pressureHpa: r.pressureHpa, conditions: r.conditions)
            return WatchWeatherSummary(start: sample, samples: [sample])
        } catch {
            return nil
        }
    }
}
