# Deploy runbook

## Golden rule for OTA updates

**Always publish OTA updates with the npm script, never a raw `eas update`.**

```
npm run deploy:ota -- --message "what changed"
```

This runs `eas update --environment production --channel production`. The
`--environment production` flag is the critical part: it loads the
`EXPO_PUBLIC_*` environment variables (Firebase config, AdMob, RevenueCat)
from EAS into the bundle.

### Why this matters (the July 2026 incident)

`eas update` bundles with **whatever env is present at that moment**. Run
without `--environment production` on a laptop that doesn't have the vars set,
and the Firebase config falls back to the `"stub"` values in
`src/services/firebase.ts`. The app still launches, but every backend call —
Sign in with Apple, sync, club reads — fails with `not-found`, because it's
pointed at a Firebase project that doesn't exist.

EAS server **builds** always have the env (they read the EAS environment
variables automatically). Local `eas update` does **not**, unless you pass
`--environment`.

## OTA update procedure

1. Merge the JS-only change to `main` (typecheck + build green).
2. Confirm `node_modules/@imuatrak/` has `watch-bridge` and `wear-bridge`
   (local `file:` modules) — run `npm install` if a fresh clone.
3. Publish:
   ```
   npm run deploy:ota -- --message "Fix club invite flow for new users"
   ```
4. Check the CLI output: **Runtime version must match the version of the app
   users have installed** — currently **1.0.2** (the live iOS build). A
   mismatch means the update reaches nobody, and the publish still says
   "success", so this line is the only warning you get.
5. **Verify on a real device**: install the update, confirm Sign in with Apple
   works, before telling anyone it's fixed. If the device shows no change,
   suspect the runtime before you suspect the code.

### The runtime trap

`app.config.js` sets `runtimeVersion: { policy: "appVersion" }`, so the
`version` field IS the OTA runtime. Raising it in anticipation of a build
retargets every subsequent OTA at a runtime no device has.

That is exactly what happened between 2026-08-03 and 2026-08-09: #62 set
`version: "1.0.3"` for a build that was never made, and six days of OTAs — the
Android release path in #63 among them — were published to runtime 1.0.3 while
every user sat on the 1.0.2 binary. Each one reported success.

**Only raise `version` in the commit that actually produces the native build.**
To check what is really installed: expo.dev → project → Builds, or read the
version on the phone's app listing.

## Emergency rollback

If an OTA breaks production, revert everyone to the last store binary's
embedded (known-good) bundle:

```
npm run deploy:ota:rollback
```

Devices pick up the rollback on their next launch. Then fix forward and
re-publish with step 3 above.

## What can and can't ship over the air

- **OTA-able (JS/asset only):** UI, screens, business logic, copy, the club
  invite flow, guest mode, dragon boats.
- **Needs a new native build (`npm run build:ios` / `npm run build:android`) +
  store submit:** anything touching `app.config.js` native config — new
  permissions, background modes, `associatedDomains`/universal links,
  `intentFilters`/App Links, `targetSdkVersion`, plugins, SDK bumps.

## New native version to the App Store

1. `npm run build:ios`
2. `npm run submit:ios`
3. Wait for the processing email (build appears in TestFlight first).
4. In App Store Connect, create the new version (e.g. 1.0.1) with the "+" next
   to "iOS App", select the build, fill "What's New", submit.

## New native version to Google Play

```
npm run build:android
npm run submit:android
```

`build:android` produces an app bundle (`.aab`) from the `production` profile;
`submit:android` uploads the most recent one.

### Which track it lands on

`eas.json` → `submit.production.android` controls this:

```json
"android": { "track": "alpha", "releaseStatus": "completed" }
```

- `track: "alpha"` is Play's built-in **closed testing** track. Change it to
  your custom track's name if you created one in Play Console, `"beta"` for
  open testing, `"internal"` for the internal track, or `"production"` to go
  live.
- `releaseStatus: "completed"` rolls the build out to that track's testers as
  soon as Play finishes processing. Use `"draft"` instead if you'd rather
  review and press Release yourself in Play Console.

This previously read `internal` / `draft`, which meant submitted builds sat as
an unreleased draft on the internal track and **never reached closed testers**.

### versionCode

Don't hand-edit it. `eas.json` sets `appVersionSource: "remote"` with
`autoIncrement: true` on the `production` profile, so EAS increments the
Android `versionCode` server-side on every production build. Play rejects any
upload whose `versionCode` isn't strictly higher than the last one.

Note that `version` in `app.config.js` (the user-visible `versionName`) is a
separate value and does **not** auto-increment — bump it by hand when you want
a new marketing version.

### What Play counts during a testing phase

Only builds that reach a track register in Play Console — repo commits and OTA
updates do not. Note also that the closed-testing requirement for personal
developer accounts is *12 testers opted in continuously for 14 days*; it does
not measure release frequency, so extra submissions neither satisfy nor
accelerate it.
