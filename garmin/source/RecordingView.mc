using Toybox.Attention;
using Toybox.Graphics as Gfx;
using Toybox.Timer;
using Toybox.WatchUi;

// Live screen: elapsed time, distance, pace, stroke rate, heart rate.
// Redraws once a second; the manager owns all the state.

class RecordingView extends WatchUi.View {

    hidden var mManager;
    hidden var mTimer;

    function initialize(manager) {
        View.initialize();
        mManager = manager;
    }

    function onShow() {
        mTimer = new Timer.Timer();
        mTimer.start(method(:onTick), 1000, true);
    }

    function onHide() {
        if (mTimer != null) { mTimer.stop(); mTimer = null; }
    }

    function onTick() {
        WatchUi.requestUpdate();
    }

    function onUpdate(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        Theme.clear(dc);

        var heading = mManager.state == STATE_PAUSED
            ? WatchUi.loadResource(Rez.Strings.Paused)
            : Format.duration(mManager.elapsedSec());
        Theme.text(dc, w / 2, h * 0.16, Gfx.FONT_NUMBER_MEDIUM, Gfx.COLOR_WHITE, heading);

        Theme.field(dc, w * 0.28, h * 0.42, Format.distanceUnit(),
                    Format.distance(mManager.distanceMeters()));
        Theme.field(dc, w * 0.72, h * 0.42, WatchUi.loadResource(Rez.Strings.Pace),
                    Format.pace(mManager.paceSecPerKm()));

        var hr = mManager.heartRate();
        Theme.field(dc, w * 0.28, h * 0.70, WatchUi.loadResource(Rez.Strings.StrokeRate),
                    mManager.strokeRate.format("%d"));
        Theme.field(dc, w * 0.72, h * 0.70, WatchUi.loadResource(Rez.Strings.HeartRate),
                    hr == null ? "--" : hr.format("%d"));
    }
}

class RecordingDelegate extends WatchUi.BehaviorDelegate {

    hidden var mManager;

    function initialize(manager) {
        BehaviorDelegate.initialize();
        mManager = manager;
    }

    // START/STOP pauses and resumes, matching every stock Garmin activity.
    function onSelect() {
        mManager.togglePause();
        if (Attention has :vibrate) {
            Attention.vibrate([new Attention.VibeProfile(50, 200)]);
        }
        WatchUi.requestUpdate();
        return true;
    }

    // BACK ends the paddle, behind a confirmation — a mis-press mid-race would
    // otherwise throw the session away.
    function onBack() {
        WatchUi.pushView(
            new WatchUi.Confirmation(WatchUi.loadResource(Rez.Strings.StopPrompt)),
            new StopConfirmationDelegate(mManager),
            WatchUi.SLIDE_UP);
        return true;
    }
}

class StopConfirmationDelegate extends WatchUi.ConfirmationDelegate {

    hidden var mManager;

    function initialize(manager) {
        ConfirmationDelegate.initialize();
        mManager = manager;
    }

    function onResponse(response) {
        if (response != WatchUi.CONFIRM_YES) { return true; }
        mManager.stop();
        // Replace the recording screen rather than stacking on it: BACK from
        // the summary should reach the start screen, not a dead live view.
        WatchUi.switchToView(new SummaryView(mManager), new SummaryDelegate(),
                             WatchUi.SLIDE_LEFT);
        return true;
    }
}
