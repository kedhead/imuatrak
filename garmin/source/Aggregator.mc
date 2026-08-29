using Toybox.Math;

// ── Aggregator.mc ────────────────────────────────────────────────────────────
// Monkey C port of src/services/aggregator.ts (and Aggregator.kt in wear/) —
// same logic, same numbers, so a Garmin paddle's totals match a phone paddle's.
//
// Track points are Dictionaries keyed exactly as src/models/index.ts spells
// them, because they are JSON-encoded and posted as-is.

module Aggregator {

    const ZONE_MIN = [0, 120, 140, 160, 175];
    const ZONE_MAX = [120, 140, 160, 175, 220];

    function emptyTotals() {
        return {
            "distanceMeters" => 0.0, "durationSec" => 0.0, "movingDurationSec" => 0.0,
            "avgPaceSecPerKm" => 0.0, "avgSpeedMps" => 0.0, "maxSpeedMps" => 0.0,
            "strokeCount" => 0, "avgStrokeRate" => 0.0, "calories" => 0.0,
            "elevationGainM" => 0.0,
        };
    }

    function totals(track, strokeCount, calories) {
        if (track.size() < 2) { return emptyTotals(); }

        var distM = 0.0;
        var movingDur = 0.0;
        var maxSpeed = 0.0;
        var elevGain = 0.0;
        for (var i = 1; i < track.size(); i++) {
            var prev = track[i - 1];
            var cur = track[i];
            var d = haversine(prev["lat"], prev["lon"], cur["lat"], cur["lon"]);
            distM += d;
            var dt = cur["t"] - prev["t"];
            // "Moving" is either real speed or real displacement — a drifting
            // canoe at anchor registers as neither.
            if (cur["speedMps"] > 0.5 || d > 0.5) { movingDur += dt; }
            if (cur["speedMps"] > maxSpeed) { maxSpeed = cur["speedMps"]; }
            var dAlt = cur["altM"] - prev["altM"];
            if (dAlt > 0) { elevGain += dAlt; }
        }

        var dur = track[track.size() - 1]["t"] - track[0]["t"];
        return {
            "distanceMeters" => distM,
            "durationSec" => dur,
            "movingDurationSec" => movingDur,
            "avgPaceSecPerKm" => distM > 0 ? dur / (distM / 1000.0) : 0.0,
            "avgSpeedMps" => dur > 0 ? distM / dur : 0.0,
            "maxSpeedMps" => maxSpeed,
            "strokeCount" => strokeCount,
            "avgStrokeRate" => dur > 0 ? strokeCount / (dur / 60.0) : 0.0,
            "calories" => calories,
            "elevationGainM" => elevGain,
        };
    }

    function emptyHrSummary() {
        var zones = [];
        for (var i = 0; i < 5; i++) {
            zones.add({ "zone" => i, "minBpm" => ZONE_MIN[i], "maxBpm" => ZONE_MAX[i], "timeSec" => 0.0 });
        }
        return { "avg" => 0, "max" => 0, "zones" => zones };
    }

    function hrSummary(track) {
        var count = 0;
        var sum = 0;
        var maxHr = 0;
        var zoneTimes = [0.0, 0.0, 0.0, 0.0, 0.0];

        for (var i = 0; i < track.size(); i++) {
            var hr = track[i]["hr"];
            if (hr == null) { continue; }
            count++;
            sum += hr;
            if (hr > maxHr) { maxHr = hr; }
            if (i == 0) { continue; }
            var z = 0;
            for (var k = 0; k < ZONE_MIN.size(); k++) {
                if (hr >= ZONE_MIN[k]) { z = k; }
            }
            zoneTimes[z] += track[i]["t"] - track[i - 1]["t"];
        }
        if (count == 0) { return emptyHrSummary(); }

        var zones = [];
        for (var i = 0; i < 5; i++) {
            zones.add({
                "zone" => i, "minBpm" => ZONE_MIN[i], "maxBpm" => ZONE_MAX[i],
                "timeSec" => zoneTimes[i],
            });
        }
        return { "avg" => (sum / count).toNumber(), "max" => maxHr, "zones" => zones };
    }

    // One split per kilometre. Metric regardless of the display units, same as
    // the phone — the unit toggle is presentation only.
    function splits(track) {
        var result = [];
        var splitStart = 0;
        var accumulated = 0.0;
        var index = 0;
        var hrSum = 0.0;
        var hrCount = 0;
        var srSum = 0.0;
        var srCount = 0;

        for (var i = 1; i < track.size(); i++) {
            accumulated += haversine(track[i - 1]["lat"], track[i - 1]["lon"],
                                     track[i]["lat"], track[i]["lon"]);
            if (track[i]["hr"] != null) { hrSum += track[i]["hr"]; hrCount++; }
            if (track[i]["strokeRate"] != null) { srSum += track[i]["strokeRate"]; srCount++; }

            if (accumulated >= 1000.0) {
                var dur = track[i]["t"] - track[splitStart]["t"];
                result.add({
                    "index" => index,
                    "distanceM" => accumulated,
                    "durationSec" => dur,
                    "avgHr" => hrCount > 0 ? hrSum / hrCount : 0.0,
                    "avgStrokeRate" => srCount > 0 ? srSum / srCount : 0.0,
                    "avgSpeedMps" => dur > 0 ? accumulated / dur : 0.0,
                });
                index++;
                splitStart = i;
                accumulated = 0.0;
                hrSum = 0.0; hrCount = 0;
                srSum = 0.0; srCount = 0;
            }
        }
        return result;
    }

    // Evenly-spaced subset. Also used on the watch to halve a full track buffer
    // in place, so it must keep the first point.
    function downsample(track, maxPoints) {
        if (track.size() <= maxPoints) { return track; }
        var step = track.size().toFloat() / maxPoints;
        var out = [];
        for (var i = 0; i < maxPoints; i++) {
            out.add(track[(i * step).toNumber()]);
        }
        return out;
    }

    function haversine(lat1, lon1, lat2, lon2) {
        var R = 6371000.0;
        var p1 = Math.toRadians(lat1);
        var p2 = Math.toRadians(lat2);
        var dp = Math.toRadians(lat2 - lat1);
        var dl = Math.toRadians(lon2 - lon1);
        var sdp = Math.sin(dp / 2);
        var sdl = Math.sin(dl / 2);
        var a = sdp * sdp + Math.cos(p1) * Math.cos(p2) * sdl * sdl;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}
