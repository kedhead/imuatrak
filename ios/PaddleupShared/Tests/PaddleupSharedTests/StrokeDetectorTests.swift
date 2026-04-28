import XCTest
@testable import PaddleupShared

final class StrokeDetectorTests: XCTestCase {

    func testDetectsStrokesAtSixtySpm() {
        let det = StrokeDetector(sampleRateHz: 50)
        let durationSec = 30.0
        let freqHz = 1.0   // 60 spm
        let dt = 1.0 / 50.0
        var strokes: [StrokeDetector.Stroke] = []
        var t = 0.0
        while t <= durationSec {
            let v = 2.0 * sin(2 * .pi * freqHz * t)
            if let s = det.onSample(tSec: t, ax: v, ay: 0, az: 0) { strokes.append(s) }
            t += dt
        }
        XCTAssert((25...32).contains(strokes.count), "expected ~30 strokes, got \(strokes.count)")
        if strokes.count >= 5 {
            let avg = strokes.dropFirst(2).map { $0.rateSpm }.reduce(0, +) / Double(strokes.count - 2)
            XCTAssertEqual(avg, 60.0, accuracy: 5.0)
        }
    }
}
