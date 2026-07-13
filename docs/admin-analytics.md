# Admin analytics

App-wide usage stats live at **imuatrak.app/dashboard/admin** (an "Admin"
link appears in the nav bar for admin accounts). The page shows:

- Total users, new users (7 d), and new signups per day (last 30 days) —
  from Firebase Auth
- Active users (7 d / 30 d) — accounts that recorded at least one session
  in the window
- Sessions all-time / 7 d, and sessions recorded per day (last 30 days)
- Clubs and publicly shared sessions

Data is aggregated on demand by the `getAppStats` Cloud Function using the
Admin SDK, so no security-rule carve-outs exist for cross-user reads.

## One-time setup

1. **Grant yourself admin.** In the [Firebase console](https://console.firebase.google.com)
   → Firestore, create a collection named `admins` and add a document whose
   **document ID is your Auth UID** (find it under Authentication → Users).
   Document contents don't matter — `{ grantedAt: <today> }` is fine. Only
   the console / Admin SDK can write these docs; clients can't self-grant.
2. **Deploy** the function, rules, and the collection-group index:

   ```bash
   cd firebase
   firebase deploy --only functions:getAppStats,firestore:rules,firestore:indexes
   ```

   The `sessions.startedAt` COLLECTION_GROUP index can take a few minutes to
   build; the page will error with a failed-precondition message until it's
   ready.
3. Sign in at imuatrak.app with the same account and open **/dashboard/admin**.

## How access is gated

- The `getAppStats` callable rejects any caller without an `admins/{uid}`
  doc — this is the real gate.
- Firestore rules let a signed-in user `get` **their own** `admins/{uid}`
  doc (never list, never write), which the web app uses only to decide
  whether to show the Admin nav link and page.

## Other places usage data already exists (no code needed)

- **Firebase console → Authentication**: total users, sign-in methods,
  recent signups.
- **App Store Connect → Analytics**: downloads, sessions-on-device, active
  devices, retention, crashes (this is device analytics, opt-in weighted).
- **Vercel → Analytics** on the imuatrak.app project: web traffic to the
  marketing site, public session pages, and dashboard.

The admin page complements these with the product-level numbers none of
them have: who is actually recording paddling sessions.

## Cost note

Each page load lists all Auth users (1 000/page) and reads the last 30 days
of session docs (projection query: `userId`, `startedAt` only) plus four
aggregate counts. At current scale this is negligible; if the app grows to
tens of thousands of sessions/month, switch the function to a scheduled job
that writes a daily `adminStats/current` snapshot doc and have the page read
that instead.
