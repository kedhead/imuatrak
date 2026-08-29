using Toybox.Math;

// ── StrokeDetector.mc ────────────────────────────────────────────────────────
// Monkey C port of src/services/stroke-detector.ts (see also
// wear/app/src/main/java/app/imuatrak/wear/services/StrokeDetector.kt).
//
// One catch per stroke is detected as a peak in the low-pass-filtered,
// gravity-removed accelerometer magnitude.
//
// SAMPLE RATE: the phone and Wear apps run this at 50 Hz. Connect IQ caps
// registerSensorDataListener at 25 Hz on the target devices, and both filter
// coefficients are per-sample, so reusing the 50 Hz values would halve the
// effective corner frequencies and skew the reported stroke rate. Applying one
// pole at half the rate is equivalent to applying it twice at the full rate, so
// each coefficient is squared through:
//
//     hpAlpha 0.97 -> 0.97^2         = 0.9409
//     lpAlpha 0.25 -> 1 - (1-0.25)^2 = 0.4375
//
// peakThreshold is an amplitude and refractorySec/minSpm/maxSpm are in seconds,
// so those carry over unchanged. src/services/__tests__/stroke-detector.test.ts
// pins the two rates against each other.

const SAMPLE_RATE_HZ = 25;

class Stroke {
    var tSec;
    var rateSpm;      // 0.0 for the first stroke — nothing to measure against
    var confidence;

    function initialize(t, rate, conf) {
        tSec = t;
        rateSpm = rate;
        confidence = conf;
    }
}

class StrokeDetector {
    const HP_ALPHA = 0.9409;
    const LP_ALPHA = 0.4375;
    const MIN_SPM = 30.0;
    const MAX_SPM = 120.0;
    const PEAK_THRESHOLD = 0.6;

    hidden var mRefractorySec;
    hidden var mHpPrevIn;
    hidden var mHpPrevOut;
    hidden var mLpPrev;
    hidden var mLastStrokeT;
    hidden var mLastSampleT;
    hidden var mLastValue;
    hidden var mRising;

    function initialize() {
        mRefractorySec = 60.0 / MAX_SPM;
        reset();
    }

    // ax/ay/az in g. Returns a Stroke on the sample where a catch is confirmed,
    // otherwise null.
    function onSample(tSec, ax, ay, az) {
        var magnitude = Math.sqrt(ax * ax + ay * ay + az * az);
        var hp = HP_ALPHA * (mHpPrevOut + magnitude - mHpPrevIn);
        mHpPrevIn = magnitude;
        mHpPrevOut = hp;
        var v = mLpPrev + LP_ALPHA * (hp - mLpPrev);
        mLpPrev = v;

        var stroke = null;
        if (mLastSampleT > 0) {
            var nowRising = v > mLastValue;
            // A peak is the sample where the signal stops rising.
            if (mRising && !nowRising && mLastValue > PEAK_THRESHOLD) {
                if (mLastStrokeT < 0 || tSec - mLastStrokeT >= mRefractorySec) {
                    var rate = mLastStrokeT < 0 ? 0.0 : 60.0 / (tSec - mLastStrokeT);
                    if (rate == 0.0 || (rate >= MIN_SPM && rate <= MAX_SPM)) {
                        var prom = mLastValue - PEAK_THRESHOLD;
                        var conf = prom / (prom + 0.5);
                        if (conf < 0.0) { conf = 0.0; }
                        if (conf > 1.0) { conf = 1.0; }
                        stroke = new Stroke(mLastSampleT, rate, conf);
                        mLastStrokeT = mLastSampleT;
                    }
                }
            }
            mRising = nowRising;
        }
        mLastValue = v;
        mLastSampleT = tSec;
        return stroke;
    }

    function reset() {
        mHpPrevIn = 0.0;
        mHpPrevOut = 0.0;
        mLpPrev = 0.0;
        mLastStrokeT = -1.0;
        mLastSampleT = -1.0;
        mLastValue = 0.0;
        mRising = false;
    }
}
