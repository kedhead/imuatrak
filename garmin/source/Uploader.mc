using Toybox.Application;
using Toybox.Application.Properties;
using Toybox.Application.Storage;
using Toybox.Communications;
using Toybox.Lang;
using Toybox.System;

// ── Uploader.mc ──────────────────────────────────────────────────────────────
// Ships finished sessions to the garminIngest Cloud Function over HTTPS,
// tunnelled through Garmin Connect Mobile's phone connection.
//
// This is where the Garmin app differs from the Apple Watch and Wear OS ones:
// Connect IQ has no equivalent of WatchConnectivity or the Wearable Data Layer
// that a React Native app can receive on, so sessions go to the backend and the
// phone app pulls them down (src/services/garmin.ts).
//
// Failure is the normal case, not the exception — a paddler is on the water
// with the phone in a dry bag on the beach — so anything that doesn't upload is
// queued in Application.Storage and retried on the next app launch, the same
// contract as TransferManager.retryPending() in wear/.

const STORAGE_TOKEN = "uploadToken";
const STORAGE_PENDING = "pending";
// Each queued paddle is a few tens of KB of track. Five is a couple of weeks of
// paddling away from the phone; beyond that the oldest is dropped rather than
// risking the watch's storage quota.
const MAX_PENDING = 5;

enum {
    UPLOAD_SENT,
    UPLOAD_QUEUED,
}

class Uploader {

    hidden var mInFlight;

    function initialize() {
        mInFlight = null;
    }

    // Queue the session, then try to drain the queue. Returns UPLOAD_SENT if an
    // upload was actually started, UPLOAD_QUEUED if it is waiting for a phone.
    function upload(session, track) {
        enqueue({ "session" => session, "track" => track });
        return sendNext() ? UPLOAD_SENT : UPLOAD_QUEUED;
    }

    // Called at app launch: anything recorded out of range goes now.
    function retryPending() {
        sendNext();
    }

    function pendingCount() {
        var pending = Storage.getValue(STORAGE_PENDING);
        return pending == null ? 0 : pending.size();
    }

    function isPaired() {
        return Storage.getValue(STORAGE_TOKEN) != null || pairingCode() != null;
    }

    // ── internals ────────────────────────────────────────────────────────────

    hidden function enqueue(item) {
        var pending = Storage.getValue(STORAGE_PENDING);
        if (pending == null) { pending = []; }
        pending.add(item);
        while (pending.size() > MAX_PENDING) {
            pending = pending.slice(1, null);
        }
        Storage.setValue(STORAGE_PENDING, pending);
    }

    hidden function sendNext() {
        if (mInFlight != null) { return true; }

        var pending = Storage.getValue(STORAGE_PENDING);
        if (pending == null || pending.size() == 0) { return false; }

        var url = ingestUrl();
        if (url == null) { return false; }

        var item = pending[0];
        var body = { "session" => item["session"], "track" => item["track"] };

        // A stored token supersedes the pairing code; the code is only used
        // until the first successful upload trades it for one.
        var token = Storage.getValue(STORAGE_TOKEN);
        if (token != null) {
            body["token"] = token;
        } else {
            var code = pairingCode();
            if (code == null) { return false; }  // not paired yet — stay queued
            body["pairingCode"] = code;
            body["deviceName"] = System.getDeviceSettings().partNumber;
        }

        mInFlight = item;
        Communications.makeWebRequest(url, body, {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => { "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON,
        }, method(:onResponse));
        return true;
    }

    function onResponse(responseCode, data) {
        var sent = mInFlight;
        mInFlight = null;

        // 401 means the pairing code was wrong or expired and 400 means the
        // payload will never be accepted — retrying either forever would pin
        // the queue behind an upload that cannot succeed, so drop it. Anything
        // else (no phone, no data, a 5xx) stays queued for the next launch.
        var accepted = responseCode == 200;
        var unrecoverable = responseCode == 400 || responseCode == 401 || responseCode == 413;
        if (!accepted && !unrecoverable) { return; }

        if (accepted && data != null && data["token"] != null) {
            // First upload after pairing: keep the long-lived token, and clear
            // the one-shot code so the field in Garmin Connect Mobile reads
            // empty again. Empty is also what tells onSettingsChanged() that a
            // later edit is a deliberate re-pair rather than a units change.
            Storage.setValue(STORAGE_TOKEN, data["token"]);
            Properties.setValue("pairingCode", "");
        }

        dequeue(sent);
        if (accepted) { sendNext(); }
    }

    hidden function dequeue(item) {
        var pending = Storage.getValue(STORAGE_PENDING);
        if (pending == null || pending.size() == 0) { return; }
        // Match on session id rather than position: the queue may have gained
        // an entry while this upload was in flight.
        var id = item["session"]["id"];
        var kept = [];
        for (var i = 0; i < pending.size(); i++) {
            if (!pending[i]["session"]["id"].equals(id)) { kept.add(pending[i]); }
        }
        Storage.setValue(STORAGE_PENDING, kept);
    }

    hidden function pairingCode() {
        var code = Properties.getValue("pairingCode");
        if (code == null) { return null; }
        code = code.toString();
        return code.length() == 6 ? code : null;
    }

    hidden function ingestUrl() {
        var projectId = Application.loadResource(Rez.Strings.FirebaseProjectId);
        // Unsubstituted placeholder — a build that was never pointed at a
        // Firebase project. Record and queue, but never upload.
        if (projectId == null || projectId.substring(0, 2).equals("__")) { return null; }
        return Lang.format("https://us-central1-$1$.cloudfunctions.net/garminIngest", [projectId]);
    }
}
