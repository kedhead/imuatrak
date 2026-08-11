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
functions in the same run succeed:

```
✔  functions[uploadAvatar(us-central1)] Successful update operation.
Functions deploy had errors with the following functions:
	expireChatMessages(us-central1)
	expireClubTrials(us-central1)
Error: Failed to upsert schedule function expireClubTrials in region us-central1
```

This is environmental rather than a code problem — `expireClubTrials` predates
the chat-retention work and fails identically. The usual causes are the **Cloud
Scheduler API not being enabled** on the project, or the CI service account
(`FIREBASE_SERVICE_ACCOUNT`) missing the **Cloud Scheduler Admin** role.

### Consequence

- **`expireClubTrials` may not be running.** Nothing else ends a club trial, so
  trial clubs can keep premium access — ads suppressed, channel limits lifted —
  indefinitely. This is the more serious of the two. Check the Firebase console
  for whether the function exists at all: if an older version deployed
  successfully at some point it is still running, and only updates are failing.
- **`expireChatMessages` has never run.** The per-club chat retention setting in
  club admin saves correctly and the UI reports what it will delete, but no
  sweep ever happens, so nothing is actually deleted.

### To fix

1. Enable the Cloud Scheduler API on the `imuatrak` project.
2. Grant the CI service account **Cloud Scheduler Admin** (and confirm it has
   **Cloud Functions Admin** + **Service Account User**).
3. Re-run the **Firebase** workflow and confirm both functions deploy.

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
