# Cost controls

How this project is protected against a surprise bill, what is already in the
code, and the console steps that have to be done by hand.

Target: stay under **~$50/month**, treat anything above that as an incident.

---

## Where the risk actually is

| Service | Can it bill you? | Why |
|---|---|---|
| **Firebase (Blaze)** | **Yes, without limit** | Pay-as-you-go. Budget alerts are email-only — they never stop spending. All real financial risk lives here. |
| **Vercel (Hobby)** | **No** | No payment method is attached to a Hobby project. Exceeding included usage throttles or pauses the deployment; it does not invoice. The downside is downtime. |
| **GitHub Actions** | Effectively no | No `schedule:` trigger in any workflow, free `ubuntu-latest` runners, no matrix builds. Minutes track PR/push volume only. |
| **Expo EAS** | Only when you ask | `eas-build.yml` and `eas-update.yml` are `workflow_dispatch` — they run when you trigger them. |
| **OpenWeather** | Quota, not bill | Free tier has hard per-minute/per-day caps. Exhausting it returns errors rather than charges. |

One caveat worth knowing: an app shipping AdMob and RevenueCat is commercial,
and Vercel's Hobby tier is for non-commercial use. That is a licensing question,
not a cost-control one, but it is the reason Vercel might one day ask you to
move to Pro — at which point Vercel *can* bill you and this table changes.

---

## Reading the bill: what drives each cost

Almost everything is Firebase on the Blaze plan, which bills per use, and each
month includes a free allowance. At ~100 active users nearly all real usage is
inside it, so the bill is mostly fixed costs (see "Warm functions" below).

| Billing line | Free each month | What in ImuaTrak drives it | Grows with |
|---|---|---|---|
| **Cloud Run Functions** | 2M invocations, plus compute | Every callable and trigger (34 functions): chat pushes, uploads, DMs, payments, workouts. **Warm instances bill around the clock.** | Messages sent, photos uploaded, members |
| **Cloud Firestore** | 50K reads/day, 20K writes/day, 1 GB | Opening feeds and chat, live listeners (each delivered doc is a read, and re-subscribing re-reads the whole initial set), leaderboards, and rule `get()`s | Members × how often they open the app |
| **Cloud Storage** | 5 GB stored, ~1 GB/day download | Chat/DM/post photos and videos, avatars, QR codes, GPX tracks | Photos posted and viewed |
| **Artifact Registry / Cloud Build** | small free tier | Building and storing function images on each functions deploy | Deploys, not users |
| **Vercel** (separate) | Hobby: not billed | The website | Can throttle, can't invoice (see table above) |

### The fixed part: warm functions

`KEEP_WARM` in `firebase/functions/src/index.ts` keeps one instance of each
call people sit and wait on (`createChannelUploadUrl`, `finalizeChannelMedia`,
`openDmThread`) running at all times, so photo sends and opening a DM never hit a
2–4 s cold start. A warm instance bills for its CPU and memory **24/7**,
whether or not anyone uses the app.

- On the 2nd-gen default (a whole vCPU) the three cost **~$0.80/day, ~$24/month**.
  That showed up as a flat daily bar from Nov 10, 2026 (#116), the bulk of that
  month's ~$10 partial bill.
- Since #155 they run on `cpu: "gcf_gen1"` (a fraction of a vCPU at 256 MiB,
  `concurrency: 1`): **~$0.13/day, ~$4/month** for all three.
- Each extra name on that list adds roughly $1.30/month. Deleting one removes
  its cost and brings back the cold start for that call.

### Rough growth estimates

Order-of-magnitude only. Chatty, photo-heavy clubs sit at the top of each range.

| Active users | Clubs (approx.) | Likely monthly bill |
|---|---|---|
| ~100 (Nov 2026) | 2–3 | ~$4–5 (mostly warm functions) |
| ~1,000 | ~20 | ~$10–40 |
| ~10,000 | ~200 | ~$100–400 |

Cost scales with usage, and usage scales with clubs. Pro subscriptions should
stay well ahead of it. If the bill outgrows revenue, the fix is to find the one
expensive piece (below), not to change hosts.

---

## When the bill jumps: triage

Work through these in order; the first usually answers it.

1. **Find the line.** Google Cloud Console → **Billing** → **Reports**. Group by
   **Service**, then by **SKU**, over the last 30 days, daily.
2. **Read the shape of the bars.**
   - **Flat, same every day, starting on a date** → something always-on was
     added: a warm instance (`minInstances`), a bigger `memory`/`cpu`, or a new
     schedule. Check `git log` for `firebase/functions/src/index.ts` around that
     date. *(Nov 2026: this was `KEEP_WARM`.)*
   - **Tracks activity (weekends, regatta days)** → normal growth. Check which
     SKU and compare with the estimates above.
   - **Sudden spike, one or two days** → a loop or abuse. Go to step 3 now.
3. **Find the function** (Cloud Run Functions line). Firebase Console →
   **Functions** → **Usage**/**Health**: sort by invocations. A trigger firing
   far more than messages are sent means a write loop (a function writing the
   document that triggers it). `maxInstances` caps how fast that can burn money,
   but it doesn't stop it.
4. **Find the reads** (Firestore line). Firebase Console → **Firestore** →
   **Usage**. Spikes in reads usually mean a listener re-subscribing in a loop
   in the app (an effect depending on an object that changes every render), or a
   screen that queries a whole collection. Check recent app changes first.
5. **Find the bytes** (Storage line). Download (egress) growing faster than
   uploads means large originals being served into small thumbnails, or a
   public URL being hot-linked. Photos are resized on upload (`imageResize.ts`);
   check any new upload path does the same.

### Quick fixes by cause

| Cause | Fix |
|---|---|
| Always-on instance | Drop it from `KEEP_WARM`, or keep `cpu: "gcf_gen1"` |
| Trigger loop | Make the function skip writes that don't change anything, and redeploy |
| Listener churn | Key effects on ids (`user.uid`, `clubId`), not objects; see Part 2 |
| Big media | Resize before upload; lower the size limit in the callable and `storage.rules` |
| Abuse | App Check monitor mode first (Part 3), then rule changes |

---

## Hosting: why not move to a VPS

Considered in Nov 2026 and rejected for now.

- **It wouldn't replace much.** Auth, Firestore (including live listeners), push
  delivery, Storage, scheduled jobs and the callable endpoints are all Firebase.
  A VPS means rebuilding those, plus a migration with real risk to a live app.
- **It adds operations work:** OS and security patches, backups, uptime and
  on-call, and scaling when a big club joins.
- **It isn't cheaper at this size.** A decent VPS is $10–40/month idle; Firebase
  is ~$5 here.
- **When to revisit:** when the bill passes ~$100/month, start with triage
  above and optimize the most expensive piece. Moving one piece (say media to
  a cheaper object store and CDN) is the next step. Wholesale migration only
  makes sense at large, steady scale.

---

## Part 1 — Console setup (manual, ~20 minutes)

### 1. Cloud Billing budget and alerts

> **A budget does not cap anything.** Google's naming is actively misleading
> here: a Cloud Billing "budget" sends email and nothing else. Crossing it does
> not throttle, pause, or block a single request. At 50× the target you get
> more email and a 50× bill.
>
> The only hard stop is detaching billing from the project via a Pub/Sub-
> triggered function, which takes the whole app offline until manually
> re-enabled. That was deliberately not built — the ceilings in Part 2 are the
> chosen mechanism, and they are what actually bounds spend.

**Current setup**: a $10/month budget exists on the project, with one alert
rule at 50% ($5) on actual spend.

$10 is a deliberately low tripwire, well under the ~$50 pain threshold, so it
fires long before anything matters. What it still needs:

- **More threshold rules.** One rule at 50% means a warning at $5 and then
  silence while it climbs. Add `90%`, `100%`, and `200%`. The over-100% rule is
  the one that distinguishes a runaway from ordinary drift.
- **A forecasted-spend rule.** Actual-only reports the money after it is gone.
  Forecasted fires when the month is *trending* past the target — on a runaway
  that is hours of extra warning, which is the difference between noticing and
  not.
- **Confirm the recipients.** Alerts default to billing-account admins, which
  may not be the inbox you actually read.

**On the two "Savings" checkboxes**: ticking them makes the budget track cost
*minus* credits. That is right for "what will I be charged", but while trial
credit remains, spend reads near $0 no matter how much usage there is — a
runaway stays invisible until the credit is exhausted and then lands all at
once. If there is credit on the account, untick them so the budget tracks gross
usage and the curve is visible early.

### 2. Record a baseline

Firebase Console → **Usage & billing** → note today's reads, writes, storage and
function invocations. An anomaly is only recognisable against a normal day.
Do this **before** deploying the changes below, so you can confirm they helped.

### 3. Firestore TTL on the weather cache

`fetchWeather` writes `weatherCache/{lat}_{lon}_{hour}` documents that are dead
after an hour but would otherwise accumulate forever.

Firebase Console → **Firestore** → **TTL** → *Create policy*:
- Collection group: `weatherCache`
- Timestamp field: `fetchedAt`

TTL deletes are free; they do not count as billed deletes.

### 4. Storage lifecycle rule

`expireChatMessages` deletes message documents and their media, but any object
orphaned by a failed cleanup bills monthly forever. Belt and braces:

Google Cloud Console → **Cloud Storage** → the default bucket → **Lifecycle** →
*Add rule*: delete objects with prefix `clubs/` older than 365 days.

Set the age comfortably longer than your longest club retention setting so the
rule only ever catches genuine orphans.

### 5. Vercel usage notifications

Vercel → Project → **Settings** → **Usage**. Enable notifications. On Hobby this
is an early warning that the site is about to be throttled — an availability
signal, not a billing one.

### 6. App Check — register, but do NOT enforce

See the section at the bottom. Register the web app in monitor mode only.

---

## Part 2 — What is already enforced in code

### Function instance ceilings — `firebase/functions/src/index.ts`

```ts
setGlobalOptions({ maxInstances: 10, memory: "256MiB", timeoutSeconds: 60 });
```

Without this every function inherits the project default of **1000** concurrent
instances. This is the single most important line in the repo for cost: it is
the only hard ceiling available, and it converts "unbounded autoscale into a
bill" into "requests queue and eventually fail". Tighter per-function limits:

| Function | maxInstances | Why |
|---|---|---|
| `onChannelMessageCreate` | 5 | Fans out across the whole club roster. |
| `onDmMessageCreate` | 5 | Same shape. |
| `getAppStats` / `computeAppStats` | 1 | Two concurrent project scans cost double for one answer. |
| `onPayOrderWrite` / `onWorkoutWrite` | 5 | Per-club triggers; a burst can't outrun the cap. |
| Warm calls (`KEEP_WARM`) | 10 (global) | `concurrency: 1` on a fractional CPU, so bursts scale out instead; see "Warm functions" above. |

`region` is deliberately **not** set — changing a deployed function's region
deletes and recreates it, breaking live clients mid-flight.

### App stats are precomputed

`getAppStats` used to page every Auth user and run a `collectionGroup` scan over
every session **on each admin page load**. It now reads one document written
daily by the `computeAppStats` schedule. The dashboard shows an "as of"
timestamp and a *Rebuild now* button, which is ignored if the snapshot is under
an hour old.

### Chat fan-out is batched

`onChannelMessageCreate` previously ran, per recipient per message: a Firestore
transaction (2 reads + 2 writes) plus an `fcmTokens` collection read, in an
uncapped `Promise.all`. Roughly **3 reads + 2 writes per member per message** —
a hundred-member club at a thousand messages a day is ~300k reads and ~200k
writes daily from chat alone.

Now: one `getAll` and one batched commit per 250 recipients, with push tokens
denormalized onto `users/{uid}.expoTokens` so the per-user token read is gone.

The badge number is computed pre-increment, so simultaneous messages can report
the same badge — badges resync when the app next opens, which was already the
accepted behaviour here.

### Weather is cached

`fetchWeather` caches per ~1km per hour in `weatherCache/`, and serves a stale
reading if OpenWeather is down or over quota rather than failing.

### Unread listeners are filtered server-side

`subscribeDmUnread` and `subscribeChannelUnread` now query
`where("unreadCount", ">", 0)` with `limit(200)` instead of streaming whole
collections and dropping the zeros client-side. A listener bills a read per
delivered document, including the full initial payload on **every**
re-subscribe.

### Listeners no longer churn on token refresh

The chat, gallery and admin pages key their effects on `user.uid` rather than
the `user` object. `onAuthStateChanged` can emit a new `User` instance for the
same account, and depending on the object tore down and re-established
listeners — re-billing their initial payload each time.

### Public reads can't be enumerated

`firestore.rules` previously had `allow read: if true` on `/clubs/{clubId}` and
`/publicSessions/{sessionId}`. `read` grants **`list`** as well as `get`, so
anyone could page those collections unauthenticated and bill a document read per
result.

- `publicSessions`: `allow get: if true; allow list: if false;` — share links
  always name their session, nothing legitimate enumerates it.
- `clubs`: `allow get: if true; allow list: if request.query.limit <= 1;` —
  the `/join/{slug}` lookup asks for exactly one document, so that shape still
  works while bulk paging does not.

### Storage media ceiling matches reality

`storage.rules` allowed **100 MB** writes. The only path either client uses,
`uploadChannelMedia`, rejects anything over **7 MB** (a callable payload can't
carry more), so the 100 MB ceiling protected nothing and let a club member park
arbitrary video in the bucket — billed monthly for storage plus egress on every
view. Now 10 MB.

### The public page caches its misses

`/s/[id]` is the only route reachable without signing in. It now sets
`export const revalidate = 300`, so repeat requests for the same id — including
**invented** ids from a crawler — are served from the route cache instead of
running the server component and hitting Firestore each time.

---

## Part 3 — App Check, and why enforcement is blocked

`web/lib/appCheck.ts` initializes App Check when
`NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is set, and no-ops otherwise. It uses
reCAPTCHA **v3** because v3 is free and Enterprise bills per assessment.

**Do not turn on enforcement.** The reason is structural, not caution:

- App Check enforcement is per-**service** (Firestore, Storage, Functions), not
  per-client. Enforcing Firestore rejects every request without a valid token.
- The phone app uses the Firebase **JS SDK** (`src/services/firebase.ts`), whose
  only App Check provider is reCAPTCHA — browser-only. DeviceCheck and Play
  Integrity require `@react-native-firebase`, a different native stack.
- So the mobile app cannot produce App Check tokens at any amount of
  configuration, and enforcing Firestore would take the shipped app offline.

Monitor mode is still worth enabling: Firebase Console → **App Check** → add the
web app with your reCAPTCHA v3 site key, leave every service **unenforced**. The
console then reports what share of web traffic is unverified, which is the
measurement that tells you whether scripted abuse is actually happening — before
you spend anything on fixing it.

Enforcement becomes available only after migrating mobile to
`@react-native-firebase`, which is a significant piece of work and should be
justified by what monitor mode actually shows.

---

## Part 4 — Deliberately not done

- **No billing kill switch.** Nothing here can take the app offline to save
  money. The protections are ceilings and caching, not cutoffs.
- **No rate-limiting middleware.** The web app has no Next.js API routes to
  protect; every callable already checks `request.auth`, and `maxInstances`
  bounds the damage. Revisit if App Check monitoring shows real abuse.
- **`countExpiringMessages` left as-is.** It runs one `getCountFromServer` per
  channel, but only when a club admin *tightens* chat retention on the settings
  page — a rare, human-initiated action over a handful of channels. Folding it
  into a `collectionGroup` query would need a new composite index for savings
  that round to zero.
- **`<img>` left in place, not migrated to `next/image`.** `next lint` warns
  about this on every image in the web app. Ignore it here: Vercel bills image
  optimization per source image, so "fixing" the warning would *add* a cost
  line that is currently exactly $0. The real inefficiency is that full-size
  originals are served into small thumbnails — the fix for that is resizing on
  upload in `uploadPostMedia`, which costs nothing per view.
- **Rules-level `get()`/`exists()` multipliers not removed.** `isClubMember()`
  and friends each cost a billed document read on top of the query itself, so
  real read volume is a multiple of query count. Removing them means
  denormalizing membership into custom auth claims — a real improvement, and a
  much larger change than this pass.

---

## Part 5 — Deploying and verifying

Deploy rules first, then functions:

```bash
cd firebase
firebase deploy --only firestore:rules,storage --project imuatrak
firebase deploy --only functions --project imuatrak
```

Then check, in order:

1. **Joining still works.** Open `/join/{slug}` for a real club while signed
   out. This is the query the `list` rule was narrowed around — if it broke,
   the limit constraint is wrong.
2. **A share link still works.** Open `/s/{id}` for a real public session
   signed out, then a made-up id. Both should render; the second should be a
   not-found page, not an application error.
3. **Chat still notifies.** Send a message in a club channel with at least two
   members. Confirm the recipient's unread count increments, a push arrives, a
   muted channel stays silent, and an `@`-mention cuts through a mute.
4. **Admin stats load.** `/dashboard/admin` should render with an "as of"
   timestamp. The first load after deploy builds the snapshot inline (the
   schedule has not fired yet) and will be slow — once.
5. **Usage drops.** Watch Firebase → Usage & billing for 24h against the
   baseline from Part 1 step 2. Chat-heavy days should show the largest change.

Local checks before any of that:

```bash
cd firebase/functions && npm run build   # typecheck functions
cd web && npm run typecheck && npm run build
npx tsc --noEmit                         # mobile app, from repo root
```
