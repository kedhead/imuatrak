using Toybox.Application.Properties;
using Toybox.Lang;

// Display formatting. The units toggle is presentation only — everything stored
// and uploaded is metric, exactly as on the phone.

module Format {

    const M_TO_MI = 0.000621371;

    function imperial() {
        var value = Properties.getValue("imperial");
        return value != null && value;
    }

    function distance(meters) {
        if (imperial()) {
            return (meters * M_TO_MI).format("%.2f");
        }
        return (meters / 1000.0).format("%.2f");
    }

    function distanceUnit() {
        return imperial() ? "MI" : "KM";
    }

    // mm:ss per km or per mile.
    function pace(secPerKm) {
        if (secPerKm == null) { return "--:--"; }
        var sec = imperial() ? secPerKm / 0.621371 : secPerKm;
        if (sec > 3599) { return "--:--"; }
        return Lang.format("$1$:$2$", [
            (sec / 60).toNumber().format("%d"),
            (sec.toNumber() % 60).format("%02d"),
        ]);
    }

    function duration(totalSec) {
        var hours = totalSec / 3600;
        var minutes = (totalSec % 3600) / 60;
        var seconds = totalSec % 60;
        if (hours > 0) {
            return Lang.format("$1$:$2$:$3$",
                [hours.format("%d"), minutes.format("%02d"), seconds.format("%02d")]);
        }
        return Lang.format("$1$:$2$", [minutes.format("%d"), seconds.format("%02d")]);
    }
}
