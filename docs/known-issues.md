# Known issues

Problems that are understood but not yet fixed. Each one is real, reproducible,
and has a consequence worth knowing about before it bites.

---

## 1. RevenueCat billing integration is parked — the DM paywall is not enforced

**Status:** blocked on Secret Manager setup (needs project owner access).

`firebase/functions/src/revenuecat.ts` is deliberately **not imported by
index.ts**, so none of its functions are deployed. Its own header explains why:
it declares two secrets via `defineSecret()`, and the Firebase CLI resolves
*every* declared secret while analysing the codebase — before working out which
functions to deploy. A secret that doesn't exist fails the **entire** functions
deploy, every function included. Neither secret was ever created.

### Consequence

There is **no server-side record of a personal entitlement anywhere in
Firestore**. The DM paywall (`app/club/members.tsx` → `handleMessage`) is
therefore enforced **client-side only** and can be bypassed by a modified client.

`openDmThread` in `firebase/functions/src/index.ts` is the single path by which a
DM thread can be created, so it is the right place to enforce this once a
server-side signal exists. A comment there marks the spot.

Club-level billing is unaffected in practice: `clubGrantsAdFree()` reads
`subscriptionStatus` off the club document, which is set by other means.

### To fix

1. Create both secrets in Secret Manager (project `imuatrak`):
   - `REVENUECAT_WEBHOOK_AUTH` — the exact `Authorization` header value
     RevenueCat is configured to send.
   - `REVENUECAT_SECRET_API_KEY` — a RevenueCat secret API key (`sk_...`).
   Either `firebase functions:secrets:set <NAME>` or the Cloud Console.
2. Re-export from `index.ts`:
   `export { revenuecatWebhook, syncClubPlan } from "./revenuecat";`
3. Point the RevenueCat dashboard webhook at the deployed function URL.
4. Extend the webhook to persist the personal entitlement onto `users/{uid}`,
   then check it in `openDmThread`.

---

## 2. Scheduled Cloud Functions fail to deploy — trials never expire

**Status:** blocked on Google Cloud IAM / API enablement (needs project owner
access).

Every functions deploy fails on the two `onSchedule` functions while ordinary
functions in the same run succeed. The 2026-08-11 run (commit `837fc40`) gave
the underlying cause rather than the wrapped `Failed to upsert schedule
function` message seen previously:

```
HTTP Error: 403, The principal (user or service account) lacks IAM permission
"cloudscheduler.jobs.update" for the resource
"projects/imuatrak/locations/us-central1/jobs/firebase-schedule-expireClubTrials-us-central1"
```

So this is **purely an IAM permission gap**, not a missing API and not a code
problem. Two things follow from the wording:

- The Cloud Scheduler **API is enabled** — a disabled API returns 403
  `SERVICE_DISABLED`, not a per-permission denial.
- The scheduler job for `expireClubTrials` **already exists** (the denied verb is
  `jobs.update`, on a named existing resource). It was created by an earlier
  deploy, back when the CI service account still had the permission or before
  the schedule was first written.

### Consequence

- **`expireClubTrials` is running, but frozen at its last successfully deployed
  version.** The existing Cloud Scheduler job still fires on its schedule, so
  trials do expire; what fails is every attempt to *update* the function or its
  schedule. Any change to trial-expiry logic silently does not take effect.
- **`expireChatMessages` has never run.** It is newer, so its scheduler job was
  never created — the same IAM gap blocks the create. The per-club chat
  retention setting in club admin saves correctly and the UI reports what it
  will delete, but no sweep ever happens, so nothing is actually deleted.

### To fix

Grant the CI service account (`FIREBASE_SERVICE_ACCOUNT`) the **Cloud Scheduler
Admin** role (`roles/cloudscheduler.admin`) on project `imuatrak` — that is the
role carrying `cloudscheduler.jobs.update` and `cloudscheduler.jobs.create`.
Then re-run the **Firebase** workflow and confirm both functions deploy.

Needs project-owner access in Google Cloud, so it cannot be fixed from a code
change. No API enablement step is needed.

---

## Related deployment gotcha (fixed, but worth remembering)

`firebase/storage.rules` and `firebase/firestore.rules` deploy in a **single
command** in `.github/workflows/firebase-rules.yml`. A compile error in either
file fails both. This silently blocked three merged rule changes between
2026-08-10 02:47 and 18:06 — production served rules from 08-09 while the merges
looked successful. The cause was a wildcard inside a path segment
(`match /users/{uid}/avatar.{ext}`); wildcards must be a whole segment.

If a rules change appears not to take effect, check the **Deploy Firebase rules**
workflow run before suspecting the rules themselves.
