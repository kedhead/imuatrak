# App Store Submission — Required Metadata & Reviewer Notes

Paste-ready text for App Store Connect. Keep this updated as guidelines change.

---

## 1. App Description — append these lines at the bottom

App Store Connect → App Store → [version] → **Description**

```
Subscription: ImuaTrak+ is an auto-renewable subscription that removes ads.
• Length: 1 month, auto-renewing
• Price: shown in-app on the ImuaTrak+ screen (Settings › Remove Ads)
Payment is charged to your Apple ID at confirmation of purchase. The
subscription renews automatically unless cancelled at least 24 hours before
the end of the current period. Manage or cancel anytime in your device's
subscription settings.

Terms of Use (EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: https://imuatrak.app/privacy
```

## 2. App Information fields

App Store Connect → App Information
- **Privacy Policy URL:** `https://imuatrak.app/privacy`
- **EULA field:** leave blank to use Apple's standard EULA (already linked in the
  Description above), OR paste
  `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`

---

## 3. App Review Information → Notes (paste the whole block)

```
=== ImuaTrak Review Notes ===

AUTO-RENEWABLE SUBSCRIPTION (ImuaTrak+)
The subscription screen (Settings › Remove Ads, or any ad banner) shows:
• Title: ImuaTrak+ (Monthly)
• Length: 1 month, auto-renewing
• Price and price-per-unit: displayed from the App Store product
• Functional links to Terms of Use (EULA) and Privacy Policy
These links also appear in the App Description. Apple's standard EULA is used.

BACKGROUND LOCATION (core feature — Guideline 2.5.4)
ImuaTrak requires persistent background location to record a paddling
session's GPS route, distance, and pace in real time while the phone is
stowed or locked. Significant-change location is insufficient because a
continuous high-accuracy track is required to draw the route and compute pace.

To reproduce:
1. Open the app and tap the "Record" tab.
2. Tap "Start paddling" and grant location permission (Allow While Using).
3. Lock the phone or switch to another app and move ~100m or more.
4. The blue background-location indicator stays active and a
   "ImuaTrak is recording" notification is shown.
5. Reopen the app — the route map, distance, and pace updated continuously
   the entire time the app was backgrounded.
(A screen recording demonstrating this is attached to the submission reply.)

HEALTHKIT
This build does not use Apple HealthKit. All workout data is recorded and
stored within ImuaTrak; there are no HealthKit entitlements, usage strings,
or framework references in the binary.

TEST ACCOUNT
[Provide a demo account email + password here, or note Sign in with Apple.]
```

---

## 4. Checklist before hitting Submit

- [ ] New EAS **production** build uploaded (HealthKit removed — must be a fresh
      native build, not an OTA)
- [ ] App Description includes the EULA + Privacy links (section 1)
- [ ] Privacy Policy URL set in App Information (section 2)
- [ ] Review Notes pasted (section 3)
- [ ] Background-location screen recording attached to the reply / submission
- [ ] Subscription product is "Ready to Submit" (localization, price, review
      screenshot all complete — no "Developer Action Needed")
