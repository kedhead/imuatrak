using Toybox.Application;
using Toybox.Lang;
using Toybox.Math;
using Toybox.System;
using Toybox.Time;
using Toybox.Time.Gregorian;

// ── SessionBuilder.mc ────────────────────────────────────────────────────────
// Builds the session Dictionary the garminIngest Cloud Function expects. Keys
// mirror src/models/index.ts exactly (as models/Session.kt does for Wear), so
// the function stores what arrives without conversion.

module SessionBuilder {

    const SCHEMA_VERSION = 1;
    const CRAFT_TYPES = ["OC1", "OC2", "OC6", "V1", "SUP", "SURFSKI"];

    function build(craftType, startedMoment, endedMoment, track, strokeCount, calories) {
        return {
            "id" => newId(startedMoment),
            "schemaVersion" => SCHEMA_VERSION,
            "source" => "garmin",
            "appVersion" => appVersion(),
            "craftType" => craftType,
            "startedAt" => isoTime(startedMoment),
            "endedAt" => isoTime(endedMoment),
            "totals" => Aggregator.totals(track, strokeCount, calories),
            "hr" => Aggregator.hrSummary(track),
            "splits" => Aggregator.splits(track),
            // Side-switch ("hut") detection is audio-based and phone-only.
            "sideSwitches" => [],
            "trackSummary" => Aggregator.downsample(track, 200),
        };
    }

    // The ingest function requires ^[A-Za-z0-9_-]+$ and treats the id as the
    // idempotency key, so it must be stable for one paddle and unique across
    // paddles: start time plus a random tail.
    function newId(startedMoment) {
        return Lang.format("$1$-$2$", [
            startedMoment.value().format("%d"),
            (Math.rand() % 100000).format("%05d"),
        ]);
    }

    function isoTime(moment) {
        var d = Gregorian.utcInfo(moment, Time.FORMAT_SHORT);
        return Lang.format("$1$-$2$-$3$T$4$:$5$:$6$Z", [
            d.year.format("%04d"), d.month.format("%02d"), d.day.format("%02d"),
            d.hour.format("%02d"), d.min.format("%02d"), d.sec.format("%02d"),
        ]);
    }

    function appVersion() {
        var version = Application.loadResource(Rez.Strings.AppVersion);
        return version == null ? "0.0.0" : version;
    }
}
