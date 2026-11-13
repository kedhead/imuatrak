# App Store Submission — Required Metadata & Reviewer Notes

Paste-ready text for App Store Connect. Keep this updated as guidelines change.

---

## 1. App Description (paste the whole block)

App Store Connect → App Store → [version] → **Description**. Limit 4,000
characters; this is ~2,500. Last checked against the code 2026-11-09.

```
Track every paddle and run your whole club in one app. ImuaTrak is built by paddlers for outrigger canoe (OC1, OC2, OC6, V1), SUP, surfski and dragon boat crews. Imua: charge forward.

TRACK EVERY PADDLE (FREE)
• GPS recording: distance, pace, speed, splits and your route on a map
• Stroke rate from your phone's motion sensors
• Heart rate from a Bluetooth chest strap (Garmin, Polar and more)
• Weather conditions saved with every session
• Apple Watch app: record from your wrist with live heart rate; sessions sync to your iPhone and save to Apple Health
• Stats, personal bests and weekly distance goals
• Export GPX for Strava, Garmin Connect and more, or import GPX from another watch
• Share any session with a public link
• Start recording right away, no account needed

RUN YOUR CLUB (FREE)
• Create or join a club with an invite link or QR code
• Practice, race and social calendar with RSVPs, guest paddlers and reminders
• Boat lineups: seat your crew in OC1 to OC6 and dragon boats
• Sign-up sheets with templates for potlucks, race-day gear and volunteers
• Surveys for end-of-season feedback, race debriefs and practice times, with an anonymous option
• Team feed with announcements, posts, polls, likes and comments
• Club chat with photos, video, reactions, @mentions and pinned messages
• Push notifications for messages and mentions
• Member roster and profiles, plus birthday shout-outs
• A calendar feed to show your schedule on your club website
• Belong to more than one club and switch in a tap

IMUATRAK+ (PERSONAL)
• No ads anywhere in the app
• Message any paddler in your club directly
• Support an independent paddling app

CLUB PLAN (ONE PLAN COVERS EVERY MEMBER)
• No ads for everyone in the club
• Everyone can message each other directly
• Group chats for any crew, carpool or race team, private to the people in them
• Unlimited chat channels, public or private
• Club photo gallery with hashtags and teammate tagging
• Try it free for 7 days

Subscriptions: ImuaTrak+ (monthly or yearly) and the Club plan (monthly or yearly) are auto-renewable subscriptions. Prices are shown in the app before you buy. Payment is charged to your Apple ID at confirmation of purchase. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel anytime in your device's subscription settings.

Terms of Use (EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: https://imuatrak.app/privacy
```

Rules this text follows — keep them when editing:
- **Only features that exist.** Not yet shipped, so not listed: audio "hut"
  (side-switch) detection, FIT export (GPX only), the Wear OS app.
- **Free vs paid matches the gates in code** (see the benefit lists in
  `app/paywall.tsx`): ads, *starting* DMs (ImuaTrak+ or club plan), group
  chats, extra channels and the gallery (club plan). Everything else is free.
- **Apple Health is Apple Watch only.** The iPhone app doesn't read or write
  HealthKit; the bundled watch app saves its workouts to Health.
- **No other platforms** (no "Android", "Play Store").
- **No prices** — they vary by storefront and the app shows them before
  purchase. US list prices for reference: ImuaTrak+ $1.99/mo or $19.99/yr;
  Club plan $9.99/mo or $99.99/yr (see `docs/subscriptions.md`).
- The **subscription paragraph and the two links must stay at the bottom**
  (Guideline 3.1.2).

**Subtitle** (30 chars max): `Outrigger tracker & club app`

**Promotional text** (170 chars max; editable without a new build):
```
New: group chats for your crew, end-of-season surveys, and sign-up sheets for potlucks, gear and volunteers. Track every paddle and run your club in one app.
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

AUTO-RENEWABLE SUBSCRIPTIONS
Two plans, each monthly or yearly, auto-renewing:
• ImuaTrak+ (personal): no ads, and start direct messages with club members.
• Club plan (bought by a club owner/admin, covers every member): no ads for
  the whole club, direct messages, group chats, unlimited chat channels and
  the club photo gallery. Clubs can start a one-time 7-day free trial.
The subscription screen (Settings › Remove Ads, any ad banner, or a locked
club feature) shows the title, length, price and price-per-unit from the App
Store product, plus functional links to Terms of Use (EULA) and Privacy
Policy. These links also appear in the App Description. Apple's standard EULA
is used.

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

HEALTHKIT (Apple Watch app only)
The iPhone app does not read or write HealthKit data. The bundled Apple Watch
app uses HealthKit to run a paddling workout session (HKWorkoutSession,
activity type paddleSports), read live heart rate during that workout, and
save the finished workout to Health. That is why the iOS app's Info.plist
carries NSHealthShareUsageDescription / NSHealthUpdateUsageDescription: they
are required on the companion app for the embedded watch target.

To see it: on a paired Apple Watch, open ImuaTrak, pick a craft and start a
paddle; heart rate appears on the workout screen, and the finished workout
shows in the Health app and syncs to the iPhone app's history.

TEST ACCOUNT
[Provide a demo account email + password here, or note Sign in with Apple.]
```

---

## 4. Checklist before hitting Submit

- [ ] New EAS **production** build uploaded when native code changed (an OTA
      cannot change what's in the binary)
- [ ] App Description pasted from section 1, re-checked against what this
      build actually does, with the subscription paragraph + EULA + Privacy
      links at the bottom
- [ ] Privacy Policy URL set in App Information (section 2)
- [ ] Review Notes pasted (section 3)
- [ ] Background-location screen recording attached to the reply / submission
- [ ] Subscription product is "Ready to Submit" (localization, price, review
      screenshot all complete — no "Developer Action Needed")

---

## 5. What's New (release notes, per version)

Same rules as the description: only what this build actually does, no other
platforms in the App Store text. Google Play's field is capped at 500
characters per language.

### 1.0.9

**App Store → version 1.0.9 → What's New in This Version:**
```
A faster, fresher ImuaTrak.

• Faster photos everywhere: chat, messages, the gallery and the team feed load quickly and stay saved on your phone, so scrolling back doesn't download them again
• Photos upload faster too, and large photos that sometimes failed to post now go through
• Screens open instantly with your last-seen data while the latest loads, and taps like RSVPs respond right away
• Mute a chatty channel: tap the bell in any channel to stop its alerts. You'll still be notified when someone @mentions you
• Club owners can choose how they appear to the club: Owner, Admin, or no badge
• A brand-new launch screen and sign-in look
• Bug fixes and polish

Running your club from a laptop? Sign-up sheets, surveys and group chats are now on imuatrak.app too.
```

**Google Play → release notes (en-US):**
```
• Faster photos: chat, messages, gallery and feed load quickly and stay saved
• Faster, more reliable photo uploads
• Screens open instantly; RSVPs and taps respond right away
• Mute a chatty channel (you'll still get @mentions)
• Club owners can show as Owner, Admin, or no badge
• New launch screen and sign-in look
• Bug fixes and polish
```
