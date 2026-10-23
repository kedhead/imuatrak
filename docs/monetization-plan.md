# Monetization plan

Written 2026-10-23 from a read of the code. Everything under "verified in code"
was checked against the source; everything under "check in the dashboards" is
outside the repo and can only be confirmed by you. `docs/subscriptions.md` is
the setup reference this plan builds on.

---

## 0. Status and handoff (read this first)

The latest state, for a new session picking this up. Sections 1–5 below are the
original analysis.

### What we found (2026-10-23)

- **The live paywall shows Monthly $4.99 / month and Yearly $4.99 / year**, from
  the personal (`default`) offering. Both differ from the plan (personal $1.99,
  no personal yearly). The card prices are the store products' own prices, so
  this is dashboard configuration, not code. Two possible causes, not yet told
  apart:
  1. the yearly product (`app.imuatrak.plus.annual`) really is $4.99/year; or
  2. RevenueCat's Annual package is attached to the **monthly** product, so the
     card said "/ year" while the store bills monthly.
- **Fixed in code (947d585):** the paywall now titles each card and its
  "/ month" or "/ year" from the product's own `subscriptionPeriod`, not the
  RevenueCat package type. After that ships, a "Yearly" card that turns into
  "Monthly" confirms cause 2.
- **RevenueCat overview: 0 active subscriptions, 0 trials, $0 revenue.** Nobody
  has paid, so prices and products can change freely; no customer is affected.
- **The RevenueCat account has three projects** ("2 more projects" beside
  app.imuatrak). It's unconfirmed which one the app's public keys belong to.
- **No club section shows on the paywall** — expected: owner/admin only, and the
  club plan must not be sold before phase 2 (§2.1).
- **Why nobody subscribes, even once it works:** the only entry point for a solo
  paddler is Settings → "Remove Ads"; ads show on two screens only; $4.99 to
  remove two banners is steep; the paywall never mentions DMs.

### Prices — confirmed by Kendall (2026-10-23) except the personal yearly

Running costs are about $10–55/month (Apple $99/yr, Firebase $0–25, Expo $0–19,
RevenueCat free under $2.5k/mo revenue). Break-even is about 4–6 clubs or 25–35
personal subscribers.

| Plan | Price | Store product |
| --- | --- | --- |
| Personal monthly | **$1.99 / month** | iOS `app.imuatrak.plus.month`, Play `ad_free:adfree` |
| Personal yearly | **kept**; price not yet set (recommended $19.99 / year) | iOS `app.imuatrak.plus.annual` |
| Club monthly | **$9.99 / month** | `app.imuatrak.club.month` |
| Club yearly | **$99.99 / year** | `app.imuatrak.club.annual` |

Prices live in App Store Connect and Play Console; Kendall sets them there.

### RevenueCat API access for Claude sessions

- The cloud environment allows `api.revenuecat.com`. A RevenueCat **V2 secret
  key** is in the environment variable **`REVENUECAT_API_KEY_V2`**: Project
  configuration **read & write**, Customer information read-only. Optionally
  `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY` hold the app's public keys,
  for checking which project the app uses. Never print the secret key.
- **Use the API; don't ask for dashboard screenshots of RevenueCat.** Base URL
  `https://api.revenuecat.com/v2`, header `Authorization: Bearer
  $REVENUECAT_API_KEY_V2`. Useful reads (confirm the exact shapes against
  RevenueCat's API v2 reference):
  `GET /projects`, `/projects/{id}/apps`, `/projects/{id}/products`,
  `/projects/{id}/entitlements?expand=items.product`,
  `/projects/{id}/offerings?expand=items.package.product`.
- **Procedure:** read everything → report what's there against this plan →
  propose a list of changes → **wait for Kendall's approval** → apply → read back
  and confirm. Changes go live in the app immediately.
- **Target RevenueCat state:**
  - entitlement `app.imuatrak.plus.monthly` → the personal product(s);
    entitlement `club` → both club products;
  - offering `default`, marked Current → personal monthly only (or plus the
    yearly, if Kendall keeps it, attached to a genuinely yearly product);
  - offering `club` → **leave empty until phase 2 is live.** The paywall offers
    it to owners/admins as soon as it has packages, and a club purchase doesn't
    activate anything yet (§2.1).
- **Not reachable by the API:** store prices and durations (App Store Connect,
  Play Console) — Kendall checks those, or sends a screenshot of App Store
  Connect → Subscriptions.
- When the work is done, Kendall deletes the key in RevenueCat and removes it
  from the environment.

### Done since (2026-10-23, later)

- **Cause 2 confirmed:** the `default` offering's Annual package was attached to
  the monthly products. RevenueCat is now cleaned up through the API:
  - `default` (Current) → Monthly package: iOS `app.imuatrak.plus.month`,
    Play `ad_free:adfree`; Annual package: iOS `app.imuatrak.plus.annual`.
  - Entitlement `app.imuatrak.plus.monthly` → exactly those three products.
  - Offering `club` → Monthly `app.imuatrak.club.month`, Annual
    `app.imuatrak.club.annual` (iOS; Play club products not created yet).
  - Entitlement `club` created → iOS `app.imuatrak.club.month` and
    `app.imuatrak.club.annual` (new in App Store Connect, review screenshot still
    to add).
  - The `Club` offering (capital C, selling personal products), a stray
    `$rc_annual` offering and the unused entitlements `app.imuatrak.plus.annual`
    and `no_club` are deleted.
  - Note: the personal *store* product is `app.imuatrak.plus.month` (iOS) and
    `ad_free:adfree` (Play); `app.imuatrak.plus.monthly` is the entitlement.
- **Phase 2 code written** (branch `claude/club-billing`): the server activates
  the club the owner paid from (fixes §2.2), the webhook reconciles every event
  against RevenueCat, the paywall only says "active" once the server confirms,
  and the rules stop clients creating a club already "active" or forging
  `clubPlan`.

### Next steps

1. **Kendall:** set prices in App Store Connect and Play Console ($1.99 personal;
   club $9.99 / $99.99, confirmed). The personal yearly is kept and is back in
   `default` as its Annual package, attached to the ad-free entitlement.
2. **Kendall:** create the Play `club` subscription (base plans `monthly`,
   `annual`); then Claude adds `club:monthly` / `club:annual` to RevenueCat and
   the `club` entitlement.
3. **Kendall:** create the two Secret Manager secrets (`docs/subscriptions.md`
   → Club backend). Then deploy functions and rules, and set the RevenueCat
   webhook.
4. Ship the app change (OTA, after 1.0.7 is live), then create the `club`
   offering and sandbox-test: buy, renew, cancel, restore; the club's status
   must flip to `active` and back.
5. Phase 1 copy work (§4), adding a small "Remove ads" link under the banner ad.

---

## 1. What you sell today

| Plan | Intended price | What it actually unlocks (in code) |
| --- | --- | --- |
| **ImuaTrak+ personal** | $1.99 / month | Removes the banner ads (they appear on **Home** and **Stats** only) and lets the buyer **start** direct messages. Only for that one person. |
| **Club plan** | $5.99 / month, annual price not set | Ad-free for **every member** of the club, the club photo gallery, and extra chat channels. Members can also start DMs. |
| **Club trial** | free, 7 days, once per club; an owner or admin opts in | Same as the club plan while it lasts. |

Free for everyone: GPS tracking, history, club chat (one channel), events,
lineups, RSVPs, feed, member profiles, heart-rate straps.

---

## 2. What's wrong, most serious first

### 2.1 The club plan can take money and deliver nothing — critical

Nothing deployed ever marks a club as paid. The only code that sets
`subscriptionStatus: "active"` is in `firebase/functions/src/revenuecat.ts`,
which is still switched off (it needs two secrets that were never created —
known-issues #1).

So if the `club` offering exists in RevenueCat, an owner can tap Subscribe, be
charged $5.99, see **"Club plan active — ad-free for every member"**… and the
club stays free. Only the payer personally loses their ads. Members keep seeing
ads, the gallery stays locked, extra channels stay locked.

That's money taken for something not delivered: refunds and chargebacks at
best, an App Review problem at worst. **Fix this before anything else** — either
finish the backend (§4, phase 2) or stop offering the club plan until it is.

### 2.2 It could activate the wrong club

Once the backend is on, `activateClubPlan` doesn't use the club the owner was
looking at when they paid. It picks the first club they **own**, otherwise the
first one they **admin**. Someone who owns club A and admins club B, paying from
B's paywall, would upgrade A. Needs fixing as part of turning billing on.

### 2.3 The paywall doesn't say what you're buying

This is probably what "it shows the same" is:

- Personal and club options are drawn identically — both say **Monthly / price
  / month**, with nothing on the card saying which one covers the whole club.
- The personal plan is sold on "No ads, ever / Support independent development /
  Cancel anytime" — it never mentions the **DM** benefit, which is the more
  useful half.
- Under "Everything in ImuaTrak" it lists club chat, events, lineups and the
  feed. Those are **free**, but on a paywall they read as what you're paying for.

Apple's guideline 3.1.2 requires a subscription to clearly describe what the
user gets, so this is both a conversion problem and a review risk.

### 2.4 "Manage Subscription" opens Apple's page on Android

Settings hard-codes `apps.apple.com/account/subscriptions`. Android users can't
manage or cancel from the app. RevenueCat provides the right link per platform
(`customerInfo.managementURL`).

### 2.5 Trial checks are inconsistent — minor

Ads and the gallery check the trial's **end date**. The paywall, Settings and
the channel screens only check that the status says "trial". The daily expiry
job is running, so the gap is at most a day — but during it, the paywall tells
someone they're "ad-free via your club" while ads are showing, and offers them
nothing to buy.

### 2.6 The DM paywall is only enforced in the app — minor

There's no server-side record of a personal subscription, so a modified app
could start DMs without paying (known-issues #1). Small revenue at stake; fix
once billing is on the server.

---

## 3. Check in the dashboards (only you can see these)

### App Store Connect
- [ ] **Agreements, Tax and Banking**: Paid Apps agreement active, bank and tax
      forms complete. Without this, products load as empty — which looks
      exactly like a broken paywall.
- [ ] **App Store Small Business Program** enrolled → Apple takes **15%** instead
      of 30%. Worth checking: it doubles what you keep on the margin.
- [ ] Subscriptions: personal monthly at the price you want; `club.month` and
      `club.annual` exist, approved / ready to submit, in one subscription group.
- [ ] **App Store Server Notifications** URL set to the one RevenueCat gives you
      (renewals and cancellations reach RevenueCat promptly).

### Google Play Console
- [ ] Payments profile / merchant account active.
- [ ] The same three subscriptions, same product IDs, matching prices.
- [ ] **Real-time developer notifications** pointed at RevenueCat, and the
      service-account credentials uploaded to RevenueCat.

### RevenueCat
- [ ] Both apps (iOS, Android) exist, and the public keys match the
      `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY` values in the EAS
      **production** environment. A missing key makes the paywall say
      "temporarily unavailable" for everyone.
- [ ] Entitlement `app.imuatrak.plus.monthly` → personal product(s).
- [ ] Entitlement `club` (exactly that ID) → both club products.
- [ ] Offering `default`, marked **Current** → personal monthly only.
- [ ] Offering `club` → club monthly + annual, with package types **Monthly**
      and **Annual** (the app labels cards from the package type).
- [ ] Old products (`app.imuatrak.plus.annual`, `no_club`) out of every offering.

**Send screenshots of the RevenueCat Offerings and Entitlements pages and of the
paywall as it looks now** — that pins down "shows the same" exactly.

---

## 4. The plan

### Phase 1 — stop selling what doesn't work (code; ships over OTA)

Can go out as soon as 1.0.7 is live.

1. **Hide the club plan** on the paywall until the backend is live, behind one
   switch that phase 2 flips. Owners and admins still get the free trial.
2. **Rewrite the paywall so each plan says what it is**: personal card says
   "Just you — no ads, start DMs"; club card says "Whole club — no ads for every
   member, photo gallery, more channels". Different card styles. Drop the list
   of free features, or label it clearly as already included.
3. **Manage Subscription** uses RevenueCat's per-platform link.
4. **One trial check everywhere** (`clubGrantsAdFree` / `clubIsPro`), so no
   screen disagrees about whether a trial has ended.

### Phase 2 — turn on club billing (you: ~15 min; me: the code)

1. **You:** create the two secrets in Secret Manager — `REVENUECAT_WEBHOOK_AUTH`
   (a long random string you choose) and `REVENUECAT_SECRET_API_KEY` (an `sk_…`
   key from RevenueCat). Exact steps are in `docs/subscriptions.md`.
2. **Me:** fix §2.2. Before purchase, the app records which club it's for as a
   RevenueCat subscriber attribute (`clubId`); the server activates exactly that
   club, after checking the payer is its owner or admin.
3. **Me:** re-export the functions and deploy.
4. **You:** paste the webhook URL and the same secret into RevenueCat.
5. **Both:** sandbox test — buy, renew, cancel, restore — and confirm the
   club's status flips to `active` and back. Then flip phase 1's switch.

### Phase 3 — enforce the personal plan on the server

The webhook also records the personal entitlement on the user's document, and
`openDmThread` checks it. Closes §2.6.

### Phase 4 — measure, then tune

RevenueCat's charts give trial → paid conversion, churn, and revenue per plan.
Give it a month of real numbers before changing prices again.

---

## 5. Are you charging the right amount?

Your call, but here's the arithmetic. After the 15% store fee (assuming the
small-business rate on both stores), before sales tax:

| Plan | Price | You keep per month |
| --- | --- | --- |
| Personal | $1.99 / month | ≈ $1.69 |
| Club | $5.99 / month | ≈ $5.09 |

**Personal at $1.99 is reasonable** for what it is: removing two banner ads plus
DMs. It's a supporter tier; it won't be most of the revenue.

**Club at $5.99/month looks low.** It covers a whole club. A 40-paddler club
pays about **15¢ per paddler per month** for ad-free, the gallery, channels and
DMs for everyone — and clubs already collect dues, so the club plan is the one
that can carry the business. Options, simplest first:

- **Raise the single club price.** Something like $9.99–$14.99/month is still
  well under a dollar per paddler for a typical club.
- **Set the annual price** (it's currently unset) at about 10× monthly, so
  annual saves two months. Clubs budget yearly; annual is likely to be their
  default.
- **Tier by club size** later, if small clubs push back. More products and more
  code, so only if the numbers say so.

Raising a price doesn't affect existing subscribers unless you choose to move
them, and both stores have rules for notifying them when you do.

---

## Decisions needed from you

1. Phase 1 now (hide the club plan), or straight to phase 2 (create the two
   secrets so it works)?
2. Club price: keep $5.99, or change it? And what annual price?
3. Personal price: keep $1.99?
