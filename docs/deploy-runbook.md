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
4. Check the CLI output. It prints **two** runtime versions, one per platform,
   and each must match the binary live on that store — currently **1.0.2** on
   iOS and **1.0.1** on Android. A mismatch means the update reaches nobody on
   that platform, and the publish still says "success".

   Step 3 runs `npm run check:ota` first (an npm `pre` hook) which compares
   both declared runtimes against the newest production build EAS holds and
   aborts on a mismatch, so you should not get this far with a bad runtime.
   Run it on its own any time with `npm run check:ota`.
5. **Verify on a real device, on both platforms**: install the update, confirm
   Sign in with Apple works, before telling anyone it's fixed. If a device
   shows no change, suspect the runtime before you suspect the code.

### Runtime versions are per platform

`app.config.js` declares `ios.runtimeVersion` and `android.runtimeVersion` as
explicit strings near the top of the file. **A runtime describes what is
installed, not what you want to ship.** Set it to the `version` of the binary
that is actually on that store, and change it only in the commit that produces
a new native build for that platform.

The two platforms drift, and both directions have already cost this project:

- **iOS, Aug 3–9 2026.** Runtime came from a single `{ policy: "appVersion" }`
  and #62 raised `version` to `1.0.3` for a build that was never made. Six days
  of OTAs went to runtime 1.0.3, which no device had. Every one reported
  success.
- **Android, late July – Aug 13 2026.** The Play build shipped at 1.0.1 while
  iOS moved to 1.0.2. One shared runtime cannot be both numbers; it tracked
  iOS, so club chat, @mentions, boat lineups, DMs and the photo gallery all
  landed on iPhones and none of them reached Android. The Play app ran its
  build-time bundle from launch until the runtimes were split per platform.

That second failure is why the shared `runtimeVersion` key is gone. `version`
is now purely the store version and cannot retarget an update; the runtime
constants are separate and named. One `eas update` run publishes a bundle per
platform, each at its own runtime, so both stores stay current from a single
publish even while their native versions differ.

To check what is really installed: `npm run check:ota`, expo.dev → project →
Builds, or read the version on the phone's app listing / Play Console.

## Firebase deploys (rules, storage, functions)

`firebase.json` lives in `firebase/`, not the repo root, and the Firebase CLI
searches upward from the working directory rather than into subdirectories —
so running `firebase deploy` from the root fails to find the project at all.
The npm scripts therefore `cd firebase` first:

```
npm run deploy:rules       # firestore.rules
npm run deploy:storage     # storage.rules
npm run deploy:functions   # Cloud Functions
```

Rules and functions are NOT part of an OTA. A feature whose client calls a new
Cloud Function, or writes to a path a new rule governs, needs those deployed
**before** the OTA — otherwise the JS ships first and the feature fails against
a backend that doesn't know about it yet.

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
  `intentFilters`/App Links, `targetSdkVersion`, plugins, SDK bumps, and
  anything that adds a **dependency with native code**.

The dependency point is what decides whether a platform that has fallen behind
needs a rebuild or just an update. To check before assuming, diff `package.json`
between the commit the stale binary was built from and `main`:

```
git diff <build-commit> main -- package.json
```

Changes confined to the `scripts` block mean no native code moved and the whole
gap is OTA-able. A changed `dependencies` block means the old binary is missing
a native module the new JS will call, and an OTA to it would crash — rebuild
instead.

## The version and runtime bump, on every native build

Both stores reject a submission whose `version` does not strictly increase, and
an OTA published against the old runtime will not reach the new binary. So in
the **same commit** that produces a native build:

1. Raise `version` in `app.config.js` (the store version, shared by both
   platforms).
2. Set that platform's runtime constant — `IOS_RUNTIME_VERSION` or
   `ANDROID_RUNTIME_VERSION` — to the same number. Leave the other platform's
   constant alone; it still describes the binary live on that store.
3. After the build is live, `npm run check:ota` should show both platforms
   green before the next OTA.

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
