using Toybox.Application;
using Toybox.Graphics as Gfx;
using Toybox.WatchUi;

// Start screen: pick a craft, press START. Mirrors the Wear OS start screen
// (wear/…/MainActivity.kt) — same craft list, same one-button flow.

class PreRecordView extends WatchUi.View {

    hidden var mCraftIndex;

    function initialize() {
        View.initialize();
        mCraftIndex = 0;
    }

    function craftType() {
        return SessionBuilder.CRAFT_TYPES[mCraftIndex];
    }

    function nextCraft() {
        mCraftIndex = (mCraftIndex + 1) % SessionBuilder.CRAFT_TYPES.size();
        WatchUi.requestUpdate();
    }

    function previousCraft() {
        mCraftIndex = (mCraftIndex + SessionBuilder.CRAFT_TYPES.size() - 1)
                      % SessionBuilder.CRAFT_TYPES.size();
        WatchUi.requestUpdate();
    }

    function onUpdate(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        Theme.clear(dc);

        Theme.text(dc, w / 2, h * 0.18, Gfx.FONT_TINY, Theme.MUTED, "IMUATRAK");
        Theme.text(dc, w / 2, h * 0.40, Gfx.FONT_NUMBER_MEDIUM, Gfx.COLOR_WHITE, craftType());

        // The uploader is the only place that knows whether this watch has an
        // account to send to; say so here rather than after a paddle is lost.
        var uploader = Application.getApp().uploader;
        var status = uploader.isPaired()
            ? WatchUi.loadResource(Rez.Strings.Start)
            : "PAIR IN APP";
        Theme.text(dc, w / 2, h * 0.68, Gfx.FONT_SMALL, Theme.ACCENT, status);

        var pending = uploader.pendingCount();
        if (pending > 0) {
            Theme.text(dc, w / 2, h * 0.80, Gfx.FONT_XTINY, Theme.MUTED,
                       pending.format("%d") + " to upload");
        }
    }
}

class PreRecordDelegate extends WatchUi.BehaviorDelegate {

    hidden var mView;

    function initialize(view) {
        BehaviorDelegate.initialize();
        mView = view;
    }

    function onNextPage() {
        mView.nextCraft();
        return true;
    }

    function onPreviousPage() {
        mView.previousCraft();
        return true;
    }

    function onSelect() {
        var manager = new WorkoutManager(mView.craftType());
        manager.start();
        WatchUi.pushView(new RecordingView(manager), new RecordingDelegate(manager),
                         WatchUi.SLIDE_LEFT);
        return true;
    }
}
