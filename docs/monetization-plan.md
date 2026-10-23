# Monetization plan

Written 2026-10-23 from a read of the code. Everything under "verified in code"
was checked against the source; everything under "check in the dashboards" is
outside the repo and can only be confirmed by you. `docs/subscriptions.md` is
the setup reference this plan builds on.

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
