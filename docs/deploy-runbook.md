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
4. Check the CLI output: **Runtime version must match the live build** (build
   78 → `0.1.0`). A mismatch means the update will never apply.
5. **Verify on a real device**: install the update, confirm Sign in with Apple
   works, before telling anyone it's fixed.

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
- **Needs a new native build (`npm run build:ios`) + store submit:** anything
  touching `app.config.js` native config — new permissions, background modes,
  `associatedDomains`/universal links, plugins, SDK bumps.

## New native version to the App Store

1. `npm run build:ios`
2. `npm run submit:ios`
3. Wait for the processing email (build appears in TestFlight first).
4. In App Store Connect, create the new version (e.g. 1.0.1) with the "+" next
   to "iOS App", select the build, fill "What's New", submit.
