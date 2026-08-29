using Toybox.Graphics as Gfx;
using Toybox.WatchUi;

// End-of-paddle totals, plus where the session went. "QUEUED" is a normal
// outcome, not an error: the phone is usually on the beach, and the app
// re-sends on its next launch.

class SummaryView extends WatchUi.View {

    hidden var mManager;

    function initialize(manager) {
        View.initialize();
        mManager = manager;
    }

    function onUpdate(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        Theme.clear(dc);

        var totals = mManager.summary["totals"];

        Theme.text(dc, w / 2, h * 0.14, Gfx.FONT_TINY, Theme.MUTED, mManager.craftType);
        Theme.text(dc, w / 2, h * 0.33, Gfx.FONT_NUMBER_MEDIUM, Gfx.COLOR_WHITE,
                   Format.distance(totals["distanceMeters"]) + " " + Format.distanceUnit());
        Theme.text(dc, w / 2, h * 0.52, Gfx.FONT_MEDIUM, Gfx.COLOR_WHITE,
                   Format.duration(totals["durationSec"].toNumber()));
        Theme.text(dc, w / 2, h * 0.68, Gfx.FONT_SMALL, Theme.MUTED,
                   totals["strokeCount"].format("%d") + " strokes");

        var status = mManager.uploadState == UPLOAD_SENT
            ? WatchUi.loadResource(Rez.Strings.Saved)
            : WatchUi.loadResource(Rez.Strings.Queued);
        Theme.text(dc, w / 2, h * 0.84, Gfx.FONT_XTINY, Theme.ACCENT, status);
    }
}

class SummaryDelegate extends WatchUi.BehaviorDelegate {

    function initialize() {
        BehaviorDelegate.initialize();
    }

    function onBack() {
        // The stack is [PreRecord, Recording, Summary] — the recording view in
        // the middle belongs to a paddle that is over, so step past it.
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        return true;
    }

    function onSelect() {
        return onBack();
    }
}
