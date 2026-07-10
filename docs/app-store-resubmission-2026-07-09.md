# App Store resubmission — rejection of July 9, 2026

Submission ID `80452059-e49d-4fd8-a7bf-a1c954d85095`, version 1.0 (78),
reviewed on iPhone 17 Pro Max. Two issues: **2.5.4** (background location)
and **1.5** (Support URL).

Legend: ✅ done in code on this branch · 🏗️ you must do in App Store Connect /
on a device · ⚠️ verify.

---

## 1. Guideline 2.5.4 — `UIBackgroundModes` "location"

Same underlying complaint as the earlier 2.1 rejection: the reviewer did not
trigger a recording session, so they "could not locate" the feature that needs
persistent location. **Do NOT remove the background mode** — recording a
paddling session with the screen locked is the app's core feature
(`src/services/location.ts`, `startLocationUpdatesAsync` + the `location`
background mode). Removing it would break every real workout.

Apple's own next-steps say what to do instead:

- 🏗️ **Record a screen recording on a physical device** showing:
  1. Sign in, Home tab → **Record**, grant location, start a session.
  2. Lock the device or switch apps for 1–2 minutes **while moving** (walk
     ~100 m — distance only advances with real movement). The iOS blue
     location-indicator pill is visible in the status bar the whole time.
  3. Reopen the app — route, distance, and time have kept accumulating.
- 🏗️ Upload/attach that recording and the note below in **App Store Connect →
  App Review Information → Notes**, then **reply to the rejection message** in
  App Store Connect saying the recording is attached (Apple explicitly asked
  for a reply with the recording).

### Reviewer note (paste into App Review Information → Notes)

> **Re: Guideline 2.5.4 — background location.** ImuaTrak is a paddling
> workout tracker. Its core feature — recording the GPS route, distance, and
> pace of a paddling session — continues while the device is locked or the app
> is backgrounded, which is why the `location` value in `UIBackgroundModes` is
> required. Paddlers keep the phone in a dry bag with the screen off for the
> entire 1–3 hour workout; without persistent background location the recording
> would stop the moment the screen locks.
>
> To reproduce on a physical device:
> 1. On the first screen tap **"Continue with Apple"** (no demo account
>    needed), then on the **Home** tab tap **Record**.
> 2. Grant location permission and start the session.
> 3. Lock the device or switch to another app — the blue location indicator
>    remains in the status bar and tracking continues.
> 4. Move ~50 m or more (route/distance only advance with real movement).
> 5. Reopen the app — the session has continued accumulating route, distance,
>    and time the entire time it was backgrounded.
>
> A screen recording demonstrating this on a physical device is attached.

## 2. Guideline 1.5 — Support URL not functional

`https://imuatrak.app/support` returned an error because the marketing site
had no `/support` route.

- ✅ Added `web/app/support/page.tsx` — support page with contact email,
  FAQs (recording, background tracking, Apple Watch, subscriptions, account
  deletion, clubs), and links to Privacy/Terms.
- ✅ Added `web/app/terms/page.tsx` — the homepage footer already linked to
  `/terms`, which also 404'd (a future 3.1.2/1.5 rejection waiting to happen).
  It points to Apple's standard EULA for the app license, matching what the
  in-app paywall and Settings use.
- ✅ Homepage footer now links Support · Privacy · Terms.
- 🏗️ **Deploy the site** (Vercel) and verify all three URLs load:
  - `https://imuatrak.app/support`
  - `https://imuatrak.app/privacy`
  - `https://imuatrak.app/terms`
- ⚠️ The support page publishes **support@imuatrak.app** (and the existing
  privacy@imuatrak.app). Make sure that mailbox/alias actually exists and is
  monitored — a bouncing support address is its own rejection risk. If you'd
  rather reuse `hello@imuatrak.app`, change it in `web/app/support/page.tsx`.

---

## Resubmit sequence

1. Deploy `web/` and confirm `/support` (and `/privacy`, `/terms`) load.
2. Record the background-location screen recording on a physical device.
3. In App Store Connect: attach the recording + note to *App Review
   Information → Notes*, confirm the Support URL field is
   `https://imuatrak.app/support`.
4. Reply to the rejection message referencing the attached recording.
5. Resubmit build 78 — **no new binary is needed**; both issues are
   metadata/website + evidence, not code in the app binary.
