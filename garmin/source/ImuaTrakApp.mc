using Toybox.Application;
using Toybox.Application.Properties;
using Toybox.WatchUi;

// ── ImuaTrakApp.mc ───────────────────────────────────────────────────────────
// Entry point. Mirrors wear/…/ImuaTrakApp.kt: hold the one Uploader for the
// process and flush anything that was recorded while the phone was out of
// range, then show the start screen.

class ImuaTrakApp extends Application.AppBase {

    var uploader;

    function initialize() {
        AppBase.initialize();
        uploader = new Uploader();
    }

    function onStart(state) {
        uploader.retryPending();
    }

    function getInitialView() {
        var view = new PreRecordView();
        return [view, new PreRecordDelegate(view)];
    }

    // Fired when anything in Garmin Connect Mobile's settings changes. A code
    // typed into the (normally empty) pairing field means the user is pairing
    // again — most likely to a different account — so the stored token has to
    // go, or it would keep claiming their paddles for the old one. A units
    // change leaves the field empty and must not unpair the watch.
    function onSettingsChanged() {
        var code = Properties.getValue("pairingCode");
        if (code != null && code.toString().length() > 0) {
            Application.Storage.deleteValue(STORAGE_TOKEN);
        }
        uploader.retryPending();
        WatchUi.requestUpdate();
    }
}
