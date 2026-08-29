using Toybox.Graphics as Gfx;

// Shared drawing helpers, so the three views stay consistent across round and
// rectangular screens without per-device layouts. Colours are the ocean palette
// from src/ui/theme.ts.

module Theme {

    const DEEP = 0x07314F;
    const ACCENT = 0x19C3C9;   // aqua
    const MUTED = 0x6B7785;

    function clear(dc) {
        dc.setColor(Gfx.COLOR_WHITE, DEEP);
        dc.clear();
    }

    // Draws `text` centred on (x, y).
    function text(dc, x, y, font, colour, value) {
        dc.setColor(colour, Gfx.COLOR_TRANSPARENT);
        dc.drawText(x, y, font, value, Gfx.TEXT_JUSTIFY_CENTER | Gfx.TEXT_JUSTIFY_VCENTER);
    }

    // A label above its value — the unit of layout on the recording screen.
    function field(dc, x, y, label, value) {
        text(dc, x, y, Gfx.FONT_XTINY, MUTED, label);
        text(dc, x, y + 20, Gfx.FONT_NUMBER_MILD, Gfx.COLOR_WHITE, value);
    }
}
