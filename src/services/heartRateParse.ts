/**
 * Parser for the standard Bluetooth "Heart Rate Measurement" characteristic
 * (UUID 0x2A37, in the Heart Rate service 0x180D). Every mainstream chest
 * strap — Garmin HRM-Dual / HRM-Pro / HRM-Fit / HRM 600, Polar, Wahoo — sends
 * this exact layout, so one parser covers all of them.
 *
 * Kept free of any Bluetooth dependency so it can be unit-tested on plain
 * byte arrays.
 *
 * Layout (Bluetooth SIG, Heart Rate Service 1.0):
 *
 *   byte 0       flags
 *     bit 0      heart-rate value format: 0 = uint8, 1 = uint16 (little-endian)
 *     bits 1–2   sensor contact: 0b10 = supported, no contact; 0b11 = contact
 *                (0b0x = feature not supported)
 *     bit 3      energy expended present (uint16 kJ follows the HR value)
 *     bit 4      RR intervals present (uint16 each, units of 1/1024 s)
 *   then         heart rate, optional energy, optional RR intervals
 */

export interface HeartRateMeasurement {
  /** Beats per minute as reported by the strap. */
  bpm: number;
  /**
   * Whether the strap reports skin contact. `null` when the strap doesn't
   * support contact detection at all. When `false`, `bpm` is not trustworthy —
   * many straps keep sending their last value (or 0) after slipping off.
   */
  contact: boolean | null;
  /** Beat-to-beat intervals in milliseconds, when the strap sends them. */
  rrMs: number[];
}

/** Plausible human heart rate. Outside this, the reading is noise or a strap glitch. */
const MIN_BPM = 25;
const MAX_BPM = 240;

export function parseHeartRateMeasurement(
  bytes: ArrayLike<number>,
): HeartRateMeasurement | null {
  if (bytes.length < 2) return null;
  const flags = bytes[0]!;
  const is16Bit = (flags & 0x01) !== 0;
  const contactSupported = (flags & 0x04) !== 0;
  const contactDetected = (flags & 0x02) !== 0;
  const energyPresent = (flags & 0x08) !== 0;
  const rrPresent = (flags & 0x10) !== 0;

  let i = 1;
  let bpm: number;
  if (is16Bit) {
    if (bytes.length < 3) return null;
    bpm = bytes[1]! | (bytes[2]! << 8);
    i = 3;
  } else {
    bpm = bytes[1]!;
    i = 2;
  }

  if (energyPresent) i += 2;

  const rrMs: number[] = [];
  if (rrPresent) {
    for (; i + 1 < bytes.length; i += 2) {
      const raw = bytes[i]! | (bytes[i + 1]! << 8);
      rrMs.push(Math.round((raw * 1000) / 1024));
    }
  }

  return {
    bpm,
    contact: contactSupported ? contactDetected : null,
    rrMs,
  };
}

/**
 * The bpm worth recording from a measurement, or null when it shouldn't be:
 * the strap reports no skin contact, or the value is outside human range.
 *
 * Recording a stale or zero value while the strap is off the chest would drag
 * the average down and invent zone time, so a gap is the honest answer.
 */
export function usableBpm(m: HeartRateMeasurement | null): number | null {
  if (!m) return null;
  if (m.contact === false) return null;
  if (m.bpm < MIN_BPM || m.bpm > MAX_BPM) return null;
  return m.bpm;
}
