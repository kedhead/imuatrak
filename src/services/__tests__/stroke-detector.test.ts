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

  // The Garmin app runs this detector at 25 Hz, because that is what Connect IQ
  // gives an app. These two cases pin the constants that port has to use — if
  // the detector changes here, they tell you what garmin/source/StrokeDetector.mc
  // must become.
  describe("at the 25 Hz Connect IQ sample rate", () => {
    it("derives the coefficients hard-coded in the Monkey C port", () => {
      // The coefficients aren't exposed, so compare stroke times against an
      // independent run of the same filter chain: they match for the squared-
      // through 25 Hz pair and not for the raw 50 Hz one, which is exactly the
      // regression this guards — a detector that ignored sampleRateHz would
      // match the second.
      const signal = paddlingSignal(25);
      const detected = detectorStrokeTimes(25, signal);

      expect(detected).toEqual(referenceStrokeTimes(signal, 0.97 ** 2, 1 - 0.75 ** 2));
      expect(detected).not.toEqual(referenceStrokeTimes(signal, 0.97, 0.25));
      // The literals in garmin/source/StrokeDetector.mc.
      expect(0.97 ** 2).toBeCloseTo(0.9409, 9);
      expect(1 - 0.75 ** 2).toBeCloseTo(0.4375, 9);
    });

    it("reports the same stroke rate as 50 Hz on the same paddling signal", () => {
      const rateFor = (sampleRateHz: number) => {
        const det = new StrokeDetector({ sampleRateHz });
        const dt = 1 / sampleRateHz;
        const strokes: number[] = [];
        for (let t = 0; t <= 30; t += dt) {
          const v = Math.max(0, 2 * Math.sin(2 * Math.PI * 1 * t));
          const s = det.onSample(t, v, 0, 0);
          if (s) strokes.push(s.rateSpm);
        }
        const rates = strokes.slice(2);
        return {
          count: strokes.length,
          avg: rates.reduce((a, b) => a + b, 0) / rates.length,
        };
      };

      const fast = rateFor(50);
      const slow = rateFor(25);
      expect(Math.abs(slow.count - fast.count)).toBeLessThanOrEqual(1);
      expect(Math.abs(slow.avg - fast.avg)).toBeLessThan(2);
      expect(Math.abs(slow.avg - 60)).toBeLessThan(5);
    });
  });
});

/** 30 s of half-rectified 1 Hz bursts — one stroke per second, at `rateHz`. */
function paddlingSignal(rateHz: number): { t: number; a: number }[] {
  const out: { t: number; a: number }[] = [];
  for (let t = 0; t <= 30; t += 1 / rateHz) {
    out.push({ t, a: Math.max(0, 2 * Math.sin(2 * Math.PI * t)) });
  }
  return out;
}

function detectorStrokeTimes(rateHz: number, signal: { t: number; a: number }[]): number[] {
  const det = new StrokeDetector({ sampleRateHz: rateHz });
  const times: number[] = [];
  for (const { t, a } of signal) {
    const s = det.onSample(t, a, 0, 0);
    if (s) times.push(s.tSec);
  }
  return times;
}

/**
 * The detector's pipeline written out longhand against explicit coefficients —
 * high-pass, low-pass, peak pick with a refractory window. Only used to prove
 * which coefficients the class is actually running.
 */
function referenceStrokeTimes(
  signal: { t: number; a: number }[],
  hpAlpha: number,
  lpAlpha: number,
): number[] {
  const peakThreshold = 0.6;
  const refractorySec = 60 / 120;
  let hpPrevIn = 0;
  let hpPrevOut = 0;
  let lpPrev = 0;
  let lastStrokeT = -1;
  let lastSampleT = -1;
  let lastValue = 0;
  let rising = false;
  const times: number[] = [];

  for (const { t, a } of signal) {
    const hp = hpAlpha * (hpPrevOut + a - hpPrevIn);
    hpPrevIn = a;
    hpPrevOut = hp;
    const v = lpPrev + lpAlpha * (hp - lpPrev);
    lpPrev = v;

    if (lastSampleT > 0) {
      const nowRising = v > lastValue;
      if (rising && !nowRising && lastValue > peakThreshold) {
        if (lastStrokeT < 0 || t - lastStrokeT >= refractorySec) {
          const rate = lastStrokeT < 0 ? 0 : 60 / (t - lastStrokeT);
          if (rate === 0 || (rate >= 30 && rate <= 120)) {
            times.push(lastSampleT);
            lastStrokeT = lastSampleT;
          }
        }
      }
      rising = nowRising;
    }
    lastValue = v;
    lastSampleT = t;
  }
  return times;
}
