using Toybox.Activity;
using Toybox.Application;
using Toybox.ActivityRecording;
using Toybox.FitContributor;
using Toybox.Position;
using Toybox.Sensor;
using Toybox.System;
using Toybox.Time;
using Toybox.Timer;
using Toybox.WatchUi;

// ── WorkoutManager.mc ────────────────────────────────────────────────────────
// Owns one paddle: the FIT activity recording, the sensors feeding it, the
// in-memory track, and the handoff to Uploader when it ends.
//
// Mirrors wear/…/services/WorkoutManager.kt, with two differences forced by the
// platform: the accelerometer runs at 25 Hz (see StrokeDetector.mc), and the
// track is capped in memory rather than kept whole and downsampled at the end —
// a Connect IQ app has nowhere near the heap for an hour of 1 Hz fixes.

// Cap chosen so the JSON body stays well inside the ingest function's 256 KB
// limit and the app stays inside its memory budget on the smallest target.
const MAX_TRACK_POINTS = 300;

enum {
    STATE_IDLE,
    STATE_RECORDING,
    STATE_PAUSED,
    STATE_ENDED,
}

class WorkoutManager {

    var state;
    var craftType;
    var strokeCount;
    var strokeRate;         // most recent instantaneous rate, for the live view
    var summary;            // set once the paddle ends
    var uploadState;        // UPLOAD_SENT / UPLOAD_QUEUED once uploaded

    hidden var mTrack;
    hidden var mSampleEverySec;     // grows as the track is decimated
    hidden var mNextSampleAtSec;
    hidden var mStartedMoment;
    hidden var mDetector;
    hidden var mAccelSampleIndex;
    hidden var mLastPosition;       // [lat, lon]
    hidden var mLastAltitude;
    hidden var mLastSpeed;
    hidden var mSession;
    hidden var mStrokeRateField;
    hidden var mTimer;
    hidden var mElapsedSec;

    function initialize(craft) {
        state = STATE_IDLE;
        craftType = craft;
        strokeCount = 0;
        strokeRate = 0.0;
        summary = null;
        uploadState = null;
        mTrack = [];
        mSampleEverySec = 1;
        mNextSampleAtSec = 0;
        mElapsedSec = 0;
        mDetector = new StrokeDetector();
        mAccelSampleIndex = 0;
    }

    function start() {
        if (state != STATE_IDLE) { return; }
        mStartedMoment = Time.now();

        // Recording a real FIT activity is what puts the paddle in Garmin
        // Connect and in the user's training load — ImuaTrak's own upload is
        // additional, not a replacement.
        mSession = ActivityRecording.createSession({
            :name => craftType,
            // FIT has no outrigger sport; rowing is the closest match Garmin
            // Connect renders sensibly for every craft this app records.
            :sport => Activity.SPORT_ROWING,
            :subSport => Activity.SUB_SPORT_GENERIC,
        });
        mStrokeRateField = mSession.createField(
            "stroke_rate", 0, FitContributor.DATA_TYPE_UINT8,
            { :mesgType => FitContributor.MESG_TYPE_RECORD, :units => "spm" });
        mSession.start();

        Position.enableLocationEvents(Position.LOCATION_CONTINUOUS, method(:onPosition));
        Sensor.registerSensorDataListener(method(:onSensorData), {
            :period => 1,
            :accelerometer => { :enabled => true, :sampleRate => SAMPLE_RATE_HZ },
        });

        mTimer = new Timer.Timer();
        mTimer.start(method(:onTick), 1000, true);
        state = STATE_RECORDING;
    }

    function togglePause() {
        if (state == STATE_RECORDING) {
            mSession.stop();
            state = STATE_PAUSED;
        } else if (state == STATE_PAUSED) {
            mSession.start();
            state = STATE_RECORDING;
        }
    }

    function stop() {
        if (state == STATE_ENDED || state == STATE_IDLE) { return; }
        state = STATE_ENDED;

        if (mTimer != null) { mTimer.stop(); mTimer = null; }
        Sensor.unregisterSensorDataListener();
        Position.enableLocationEvents(Position.LOCATION_DISABLE, method(:onPosition));

        mSession.stop();
        mSession.save();

        var info = Activity.getActivityInfo();
        var calories = (info != null && info.calories != null) ? info.calories : 0;
        summary = SessionBuilder.build(craftType, mStartedMoment, Time.now(),
                                       mTrack, strokeCount, calories);
        uploadState = Application.getApp().uploader.upload(summary, mTrack);
    }

    function discard() {
        if (mTimer != null) { mTimer.stop(); mTimer = null; }
        Sensor.unregisterSensorDataListener();
        Position.enableLocationEvents(Position.LOCATION_DISABLE, method(:onPosition));
        if (mSession != null) { mSession.discard(); }
        state = STATE_ENDED;
    }

    function elapsedSec() { return mElapsedSec; }

    function distanceMeters() {
        var info = Activity.getActivityInfo();
        return (info != null && info.elapsedDistance != null) ? info.elapsedDistance : 0.0;
    }

    function heartRate() {
        var info = Activity.getActivityInfo();
        return (info != null && info.currentHeartRate != null) ? info.currentHeartRate : null;
    }

    function paceSecPerKm() {
        var speed = mLastSpeed;
        if (speed == null || speed < 0.3) { return null; }
        return 1000.0 / speed;
    }

    // ── callbacks ────────────────────────────────────────────────────────────

    function onPosition(info) {
        if (info == null || info.position == null) { return; }
        var degrees = info.position.toDegrees();
        mLastPosition = degrees;
        if (info.altitude != null) { mLastAltitude = info.altitude; }
        if (info.speed != null) { mLastSpeed = info.speed; }
    }

    // One callback per second carrying that second's accelerometer samples.
    function onSensorData(sensorData) {
        if (state != STATE_RECORDING) { return; }
        var accel = sensorData.accelerometerData;
        if (accel == null) { return; }

        var xs = accel.x;
        var ys = accel.y;
        var zs = accel.z;
        for (var i = 0; i < xs.size(); i++) {
            var t = mAccelSampleIndex.toFloat() / SAMPLE_RATE_HZ;
            mAccelSampleIndex++;
            // Samples arrive in milli-g; the detector's threshold is in g.
            var stroke = mDetector.onSample(t, xs[i] / 1000.0, ys[i] / 1000.0, zs[i] / 1000.0);
            if (stroke != null) {
                strokeCount++;
                if (stroke.rateSpm > 0) { strokeRate = stroke.rateSpm; }
            }
        }
    }

    function onTick() {
        if (state != STATE_RECORDING) { return; }
        mElapsedSec++;

        if (mStrokeRateField != null) {
            mStrokeRateField.setData(strokeRate.toNumber());
        }

        // Sampling interval widens as the track fills, so a four-hour paddle
        // costs the same memory as a one-hour one — just at coarser resolution.
        if (mElapsedSec < mNextSampleAtSec) { return; }
        mNextSampleAtSec = mElapsedSec + mSampleEverySec;
        recordPoint();
    }

    hidden function recordPoint() {
        if (mLastPosition == null) { return; }  // no fix yet

        var point = {
            "t" => mElapsedSec.toFloat(),
            "lat" => mLastPosition[0],
            "lon" => mLastPosition[1],
            "altM" => mLastAltitude == null ? 0.0 : mLastAltitude,
            "speedMps" => mLastSpeed == null ? 0.0 : mLastSpeed,
        };
        var hr = heartRate();
        if (hr != null) { point["hr"] = hr; }
        if (strokeRate > 0) { point["strokeRate"] = strokeRate; }
        mTrack.add(point);

        if (mTrack.size() >= MAX_TRACK_POINTS) {
            // Halve the track and the sampling rate together, so the points
            // kept stay evenly spaced in time.
            mTrack = Aggregator.downsample(mTrack, MAX_TRACK_POINTS / 2);
            mSampleEverySec *= 2;
        }
    }
}
