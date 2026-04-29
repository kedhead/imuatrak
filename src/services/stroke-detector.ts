/**
 * Real-time stroke detector for outrigger paddling. Same algorithm we'll
 * use on the watch (when we add it natively), so results are consistent.
 *
 * Pipeline: |a| → high-pass → low-pass → peak pick with refractory window.
 * Designed to be deterministic so the same accelerometer stream produces
 * the same stroke times across runs.
 */
export interface Stroke {
  tSec: number;
  rateSpm: number;
  confidence: number;
}

export interface StrokeDetectorOptions {
  sampleRateHz?: number;
  minStrokeRateSpm?: number;
  maxStrokeRateSpm?: number;
  peakThreshold?: number;
}

export class StrokeDetector {
  private readonly minSpm: number;
  private readonly maxSpm: number;
  private readonly peakThreshold: number;
  private readonly refractorySec: number;

  private readonly hpAlpha = 0.97;
  private readonly lpAlpha = 0.25;

  private hpPrevIn = 0;
  private hpPrevOut = 0;
  private lpPrev = 0;

  private lastStrokeT = -1;
  private lastSampleT = -1;
  private lastValue = 0;
  private rising = false;

  constructor(opts: StrokeDetectorOptions = {}) {
    this.minSpm = opts.minStrokeRateSpm ?? 30;
    this.maxSpm = opts.maxStrokeRateSpm ?? 120;
    this.peakThreshold = opts.peakThreshold ?? 0.6;
    this.refractorySec = 60 / this.maxSpm;
  }

  /**
   * Feed one sample of linear acceleration (gravity already removed).
   * Returns a Stroke if a peak was detected at this sample, else null.
   */
  onSample(tSec: number, ax: number, ay: number, az: number): Stroke | null {
    const magnitude = Math.sqrt(ax * ax + ay * ay + az * az);

    const hp = this.hpAlpha * (this.hpPrevOut + magnitude - this.hpPrevIn);
    this.hpPrevIn = magnitude;
    this.hpPrevOut = hp;

    const v = this.lpPrev + this.lpAlpha * (hp - this.lpPrev);
    this.lpPrev = v;

    let stroke: Stroke | null = null;
    if (this.lastSampleT > 0) {
      const nowRising = v > this.lastValue;
      if (this.rising && !nowRising && this.lastValue > this.peakThreshold) {
        if (this.lastStrokeT < 0 || tSec - this.lastStrokeT >= this.refractorySec) {
          const rate = this.lastStrokeT < 0 ? 0 : 60 / (tSec - this.lastStrokeT);
          if (rate === 0 || (rate >= this.minSpm && rate <= this.maxSpm)) {
            const prom = this.lastValue - this.peakThreshold;
            const conf = Math.max(0, Math.min(1, prom / (prom + 0.5)));
            stroke = { tSec: this.lastSampleT, rateSpm: rate, confidence: conf };
            this.lastStrokeT = this.lastSampleT;
          }
        }
      }
      this.rising = nowRising;
    }
    this.lastValue = v;
    this.lastSampleT = tSec;
    return stroke;
  }

  reset(): void {
    this.hpPrevIn = 0;
    this.hpPrevOut = 0;
    this.lpPrev = 0;
    this.lastStrokeT = -1;
    this.lastSampleT = -1;
    this.lastValue = 0;
    this.rising = false;
  }
}
