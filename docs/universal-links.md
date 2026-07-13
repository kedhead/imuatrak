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

Replace `REPLACE_WITH_SHA256_CERT_FINGERPRINT` with the SHA-256 fingerprint of
the **app signing certificate**:

- EAS keystore: `eas credentials -p android` shows the SHA-256.
- Once on Play with Play App Signing, use the fingerprint from Play Console →
  Setup → App signing (and add the upload key's too — the array accepts
  multiple).

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
