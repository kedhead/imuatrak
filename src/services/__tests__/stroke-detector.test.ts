import { StrokeDetector } from "../stroke-detector";

describe("StrokeDetector", () => {
  it("detects strokes from a clean 60 spm sinusoid", () => {
    const det = new StrokeDetector({ sampleRateHz: 50 });
    const durationSec = 30;
    const freqHz = 1; // 60 spm
    const dt = 1 / 50;

    const strokes: { tSec: number; rateSpm: number }[] = [];
    for (let t = 0; t <= durationSec; t += dt) {
      // Half-rectified: each positive burst = one stroke at 60 spm.
      // Using sqrt(ax²+ay²+az²) magnitude means a full sinusoid would
      // appear at 2 Hz (120 spm). Half-rectified gives realistic 1 Hz bursts.
      const v = Math.max(0, 2 * Math.sin(2 * Math.PI * freqHz * t));
      const s = det.onSample(t, v, 0, 0);
      if (s) strokes.push(s);
    }
    expect(strokes.length).toBeGreaterThanOrEqual(25);
    expect(strokes.length).toBeLessThanOrEqual(32);
    if (strokes.length >= 5) {
      const rates = strokes.slice(2).map((s) => s.rateSpm);
      const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
      expect(Math.abs(avg - 60)).toBeLessThan(5);
    }
  });
});
