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

  // Regression: the detector used to jam permanently after any pause longer
  // than 60/minSpm (2s). The peak was rejected for implying an out-of-band
  // rate AND lastStrokeT was left frozen, so every later peak was measured
  // from that same stale point and rejected too. One rest killed stroke
  // counting for the rest of the session — an 85-minute paddle reported a
  // stroke count of 1.
  it("keeps counting after a pause longer than the minimum rate allows", () => {
    const det = new StrokeDetector({ sampleRateHz: 50 });
    const dt = 1 / 50;
    const paddle = (fromSec: number, toSec: number, out: { tSec: number; rateSpm: number }[]) => {
      for (let t = fromSec; t <= toSec; t += dt) {
        const v = Math.max(0, 2 * Math.sin(2 * Math.PI * 1 * t));
        const s = det.onSample(t, v, 0, 0);
        if (s) out.push(s);
      }
    };

    const before: { tSec: number; rateSpm: number }[] = [];
    paddle(0, 10, before);

    // Ten seconds of drifting — well past the 2s that used to be fatal.
    for (let t = 10; t <= 20; t += dt) det.onSample(t, 0, 0, 0);

    const after: { tSec: number; rateSpm: number }[] = [];
    paddle(20, 30, after);

    expect(before.length).toBeGreaterThanOrEqual(8);
    // The bug made this exactly 0.
    expect(after.length).toBeGreaterThanOrEqual(8);

    // The first stroke after the rest reports an unknown cadence (0) rather
    // than an implausible one derived from the ten-second gap...
    expect(after[0]!.rateSpm).toBe(0);
    // ...and cadence re-converges on the strokes that follow.
    const resumed = after.slice(2).map((s) => s.rateSpm);
    const avg = resumed.reduce((a, b) => a + b, 0) / resumed.length;
    expect(Math.abs(avg - 60)).toBeLessThan(5);
  });
});
