# Universal links / App Links for club invites

`https://imuatrak.app/join/{club}` now opens the app **directly** (no browser
hop) once verified against the two files served by the website. Two values
must be filled in before this works — both are placeholders right now:

## 1. iOS — apple-app-site-association

File: `web/public/.well-known/apple-app-site-association`

Replace `REPLACE_WITH_TEAM_ID` with your Apple **Team ID** (same value as
`APPLE_TEAM_ID` in EAS env; developer.apple.com → Membership), keeping the
format `TEAMID.app.imuatrak`.

`app.config.js` already declares `associatedDomains: ["applinks:imuatrak.app"]`
— requires a **new native build**. Apple's CDN caches the AASA file; after
deploying the site, allow up to 24 h (or reinstall the app) before links
open the app.

## 2. Android — assetlinks.json

File: `web/public/.well-known/assetlinks.json`

The `sha256_cert_fingerprints` array holds every cert that may sign the app.
Both of these should be present:

- **Upload key** (EAS keystore "Default", from `eas credentials -p android`):
  `06:54:39:78:...:ED:FC:DB` — **already added**. Covers directly-installed
  APKs (internal testing sideloads) signed by the EAS build keystore.
- **Play App Signing key** (`FC:CF:C2:40:...:7F:1A`) — **already added**.
  Because Play App Signing is enabled, Google re-signs the AAB with its OWN
  key for Play Store installs, so production installs verify against this
  fingerprint (Play Console → App integrity → App signing → *App signing key
  certificate*).

`app.config.js` declares the verified intent filter for `/join`.

## How the whole invite chain works now

1. Admin shares the permanent link / QR / one-time code (Club → Invite).
   Share text includes the App Store link.
2. **App installed** → tapping the link opens the app straight to the join
   screen (universal link → `app/join/[slug].tsx` → auto-join).
3. **App not installed** → link opens the web invite page (club name, logo,
   member count). "Get it on the App Store" **copies the invite link to the
   clipboard** first; after install, the app's join screen finds it in the
   clipboard and pre-fills.
4. **Not signed in** → the invite is stored and the join screen sends them to
   sign-in; the Home tab resumes the join automatically right after
   (`src/services/pendingInvite.ts`).

## Verify after deploying

- `curl -s https://imuatrak.app/.well-known/apple-app-site-association` returns
  the JSON with your Team ID.
- `curl -s https://imuatrak.app/.well-known/assetlinks.json` returns the
  fingerprint.
- iOS: long-press an invite link in Notes → "Open in ImuaTrak" appears.
- Android: `adb shell pm verify-app-links --re-verify app.imuatrak`.
