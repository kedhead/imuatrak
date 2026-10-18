# Heart-rate chest straps

Bluetooth heart-rate straps for **phone** recordings. Ships in 1.0.7 (native
module — not OTA-able).

Before this, phone recordings had no heart rate source at all; it only ever came
from the Apple Watch or Wear OS apps.

## Which straps work

Anything that speaks the standard Bluetooth **Heart Rate service** (`0x180D`):
Garmin HRM-Dual, HRM-Pro / Pro Plus, HRM-Fit, HRM 600; Polar H9/H10; Wahoo
TICKR; and most others sold in the last several years.

**ANT+-only straps cannot work** (older Garmin HRM-Run, HRM-Tri, HRM3-SS):
iPhones have no ANT+ radio and Android phones have largely dropped it.

**Apple Watch users don't need this.** Pairing the strap to the watch (Watch
Settings → Bluetooth) makes watchOS use it as the workout heart-rate source, and
the watch app reads heart rate from the HealthKit workout, so it picks the strap
up with no code. Untested, but that is how HealthKit workouts behave; the
pairing screen tells iOS users this.

## How it fits together

| Piece | Where |
| --- | --- |
| Parse the Heart Rate Measurement characteristic (`0x2A37`) | `src/services/heartRateParse.ts` (+ tests) |
| Scan, connect, remember, reconnect | `src/services/heartRateStrap.ts` |
| Stamp bpm onto each GPS point; live tile | `src/services/recorder.ts`, `app/record.tsx` |
| Pair / test / forget | `app/heart-rate-strap.tsx`, entry in Settings |

Library: `react-native-ble-manager`, pinned exactly at **12.5.3**. Chosen over
`react-native-ble-plx` because it ships a codegen spec (New Architecture, which
RN 0.85 requires); ble-plx has none. It is not in Expo's SDK compatibility
matrix — no BLE library is — so the first 1.0.7 build is also its first
compile against this toolchain.

Heart rate rides on the GPS track points exactly like the watch apps, so
`aggregator.hrSummary`, zone times, per-split heart rate and the session screen
all work without changes.

### Decisions worth knowing

- **Connections are held, not owned.** `holdConnection()` returns a release
  function; the recorder holds for the whole recording, the pairing screen while
  open. The strap disconnects when the last holder lets go, so the phone isn't
  keeping a radio connection up when nothing needs it.
- **Reconnect needs no scan.** iOS retrieves a known peripheral by identifier,
  Android by address. On iOS the connect request stays pending until the strap is
  back in range, which is the right behaviour after a huli. Android retries on a
  2 → 4 → 8 → 15 s backoff.
- **Bad readings become gaps, not numbers.** A reading is dropped when the strap
  reports no skin contact, when it's outside 25–240 bpm (straps send 0 while
  settling), or when it is more than 5 s old. Those points carry no `hr` rather
  than a wrong one, so averages and zone time stay honest across a drop-out.
- **`neverForLocation` is off in the BLE config plugin.** With it on, the plugin
  adds location permissions capped at Android 11 (`maxSdkVersion 30`); merged
  with ours, GPS recording would lose location permission on Android 12+. Off,
  scanning needs location permission, which the app already holds for GPS. The
  introspected manifest was checked: location permissions are unchanged.
- **iOS gained the `bluetooth-central` background mode**, or readings stop the
  moment the screen locks.

## Device test checklist (needs a real strap — none of this runs in a simulator)

On **both** an iPhone and an Android phone:

1. Settings → Heart rate → Search, with the strap **worn** (Garmin straps only
   power up on skin contact). It should appear; tap Use; the live bpm appears.
2. Take the strap off: status should go to "no skin contact" or "Looking for the
   strap", and the live number should blank within ~5 s.
3. Record a paddle with the screen **locked** the whole time. The saved session
   should show average heart rate and per-split heart rate.
4. Mid-recording, walk out of range (or put the strap in a bowl of water) for a
   minute, then come back. Heart rate should resume without touching the phone,
   and the gap should show as a gap, not a flat line.
5. Forget the strap; record again — no heart-rate tile, nothing else changes.
6. Android 12+: confirm the first search shows the Nearby Devices permission
   prompt, and that GPS recording still works afterwards (the location
   permission concern above).
7. iOS: confirm the Bluetooth prompt text reads properly.

Watch for: the Android connect behaviour on reconnect (the least certain part,
since it relies on the retry loop rather than the OS), and whether Android 14+
keeps delivering readings with the screen off under the existing location
foreground service. If it doesn't, the service may need the `connectedDevice`
foreground-service type too.
