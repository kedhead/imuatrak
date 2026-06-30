# App Store resubmission checklist

Tracking the fixes for the rejection covering Guidelines **2.1** (background
location + ATT), **3.1.2(c)** (subscriptions), and **2.3.2** (promo image).

Legend: ✅ done in code on this branch · 🏗️ you must do in App Store Connect /
on a device · ⚠️ verify.

---

## 1. Guideline 2.1 — `UIBackgroundModes` "location" with no persistent feature

The app **does** use persistent background location — it records GPS with the
screen off during a session (`expo-location` `startLocationUpdatesAsync` +
foreground service in `src/services/location.ts`). The reviewer didn't trigger
a recording, so they couldn't see it.

- ✅ Removed the unused `"fetch"` background mode (no Background Fetch /
  `BGTaskScheduler` feature exists). `UIBackgroundModes` is now `["location"]`.
- 🏗️ **Reply to App Review with a screen recording** (physical device) that
  shows: start a recording → background the app / lock the screen → the route
  keeps tracking → reopen and the session has continued. Put it in the **Notes**
  field of *App Review Information* in App Store Connect.
- Suggested reviewer note: *"ImuaTrak records paddling sessions. Tap Record on
  the home screen, grant 'Allow While Using', start a session, then lock the
  device — GPS tracking continues in the background (foreground-service
  notification visible). This is the feature requiring the location background
  mode."*

## 2. Guideline 2.1 — ATT framework present, prompt never shown

AdMob links the AppTrackingTransparency framework, so Apple requires the prompt
to actually appear before any ad request.

- ✅ Added `expo-tracking-transparency` + an ATT prompt:
  - `src/services/ads.ts` — requests permission once per install.
  - `app/_layout.tsx` — calls it right after AdMob initializes (before ads load).
  - `src/ui/AdBanner.tsx` — serves **personalized** ads only when granted,
    otherwise `requestNonPersonalizedAdsOnly` (no consent needed).
  - `app.config.js` — `expo-tracking-transparency` plugin with
    `NSUserTrackingUsageDescription` copy.
- 🏗️ After pulling this branch, run **`npx expo install expo-tracking-transparency`**
  to pin the exact SDK-56-compatible version (the `package.json` entry is a
  best-guess pin), then make a **new native build** (`eas build`). ATT will not
  appear on an OTA update — it needs the native framework + Info.plist key.
- 🏗️ In App Store Connect → **App Privacy**, make sure your "tracking"
  declaration matches reality: if you keep personalized ads, declare the data
  used for tracking; if you'd rather not track at all, set personalized ads off
  and declare no tracking. Either way the prompt now appears.
- 🏗️ Reply with a screen recording from a **fresh install** showing the ATT
  prompt before any ad loads.

## 3. Guideline 3.1.2(c) — Subscription info / links

In-app, the paywall (`app/paywall.tsx`) already renders, unconditionally:
title (`product.title`), length (period label), price (`priceString`), and
**functional** Terms (EULA) + Privacy links. Settings has the same links. So
the in-app requirement is met in code.

- ⚠️ **Verify `https://imuatrak.app/privacy` is actually live** — a link that
  404s counts as "non-functional". The page exists in `web/app/privacy/`; make
  sure it's deployed at that URL.
- 🏗️ App Store Connect **metadata** (this is the part Apple is asking for):
  - Add the **Privacy Policy URL** in the *App Privacy* section.
  - Add the **EULA**: either a link to Apple's standard EULA in the **App
    Description**, or your custom EULA in the *License Agreement* field.

## 4. Guideline 2.3.2 — Promotional image is a screenshot

The promoted in-app-purchase image must be a **unique marketing graphic**, not
an app screenshot.

- 🏗️ Replace the promoted-IAP image (1024×1024) in App Store Connect with a
  designed graphic that represents ImuaTrak+ (e.g. branded "Remove Ads" art) —
  not a captured screen. *(Cannot be done in code.)*
- Alternative: if you don't need the **promoted** IAP on your product page,
  remove the promotion entirely in App Store Connect. That also sidesteps any
  promoted-purchase deep-link edge of 3.1.2(c).

---

## Build & submit sequence

1. `npx expo install expo-tracking-transparency` (pin exact version)
2. `npm run typecheck` and a smoke run
3. `eas build --profile production --platform ios` (native build — required for
   ATT + the Info.plist changes)
4. Upload, update the App Store Connect metadata items above (3 & 4)
5. Add the two screen recordings (1 & 2) to *App Review Information → Notes*
6. Submit
