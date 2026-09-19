# Push notifications

How chat pushes actually get delivered, and what has to be configured outside
this repo for them to work.

## The pipeline

1. **Client registers a token.** `app/_layout.tsx`, on every auth state change:
   asks permission, then `Notifications.getExpoPushTokenAsync({ projectId })`.
   The result is an **Expo** token (`ExponentPushToken[...]`), not a raw device
   token — the Expo Push Service handles APNs/FCM routing from that one type.
2. **Token is stored twice.** `registerFcmToken` (`src/services/clubService.ts`)
   writes `users/{uid}/fcmTokens/{token}` and mirrors it into
   `users/{uid}.expoTokens`. The mirror exists so the push fan-out can read
   tokens from the user doc it already fetches, instead of paying a
   subcollection read per recipient per message.
3. **Functions fan out.** `onChannelMessageCreate` / `onDmMessageCreate` bump
   unread counters and build push messages.
4. **`sendExpoPush` delivers** to `https://exp.host/--/api/v2/push/send`, reads
   the tickets that come back, logs failures, and prunes dead tokens.

## Required setup outside this repo

### Android — `google-services.json` (this is what was missing)

Android cannot register with FCM without the app's own Firebase config compiled
into the binary. Without it `getExpoPushTokenAsync()` throws, no token is ever
stored, and **no Android device receives anything**. This was the state of the
app from the beginning; `android.googleServicesFile` had never been set.

1. Firebase Console → Project settings → Your apps → Android. If no Android app
   exists, add one with package name **`app.imuatrak`**.
2. Download `google-services.json`.
3. Provide it to builds. It is gitignored, so either:
   - **EAS (what production uses):** create a FILE-type secret named
     `GOOGLE_SERVICES_JSON` (`eas secret:create --scope project --name
     GOOGLE_SERVICES_JSON --type file --value ./google-services.json`). EAS
     materializes it on the builder and sets the env var to its path.
   - **Locally:** drop the file at the repo root; `app.config.js` finds it.
4. **Rebuild.** This is compiled in — it cannot be delivered by OTA.

### Android — FCM V1 credentials on Expo

Separately from the client config, the Expo Push Service needs permission to
call FCM on the project's behalf.

- Firebase Console → Project settings → Service accounts → **Generate new
  private key**.
- Upload it at expo.dev → the project → Credentials → Android → **FCM V1**.

It must be **V1**. Google shut off the FCM legacy API (the old server key) in
June 2024; a project still configured with a legacy key gets `MismatchSenderId`
or `InvalidCredentials` tickets on every send.

### iOS — APNs key

expo.dev → Credentials → iOS → Push Key. EAS normally creates this during the
first build. iOS needs **no** `GoogleService-Info.plist` for push: Expo talks to
APNs directly, and FCM is not in the path at all.

## Diagnosing

The single most useful thing to know: **a 200 from the Expo send endpoint does
not mean delivered.** Expo replies 200 with one ticket per recipient and reports
real failures inside the body. The code used to check only `res.ok`, which is
why a platform could be failing 100% of its pushes and look completely healthy
in the logs.

`sendExpoPush` now logs every error ticket as
`Expo push ticket error [Code]: message`. Read them in the Cloud Functions log:

| Ticket code | Meaning | Fix |
| --- | --- | --- |
| `DeviceNotRegistered` | App uninstalled, or the token was rotated. | Handled automatically — the token is pruned from both places. |
| `MismatchSenderId` | The FCM credentials on Expo don't match the sender in `google-services.json`. | Re-upload the FCM V1 key; confirm both come from the same Firebase project. |
| `InvalidCredentials` | Missing or legacy FCM credentials / missing APNs key. | Upload FCM **V1** key (Android) or the APNs key (iOS). |
| `MessageTooBig` | Payload over 4 KiB. | Shorten the body. |
| `MessageRateExceeded` | Too many to one device. | Back off. |

If the send itself fails with a **401/400 before any tickets**, the Expo account
likely has *Enhanced Security for Push Notifications* enabled. Set an
`EXPO_ACCESS_TOKEN` env var on the functions; `sendExpoPush` sends it as a
bearer token when present. It is deliberately a plain env var and not a
`defineSecret` — declaring a secret that doesn't exist in Secret Manager fails
the entire functions deploy (see `revenuecat.ts`).

### Checking whether a user has a usable token

```
users/{uid}.expoTokens   →  array of ExponentPushToken[...] strings
```

Empty or missing means registration never succeeded on that device. Since the
client now logs `[push] token registration failed:` instead of swallowing the
error, the device log says why.

## Gotchas

- Tokens are added with `arrayUnion` and were never removed, so accounts
  accumulated dead tokens forever. `sendExpoPush` prunes on
  `DeviceNotRegistered` now, but existing docs may still carry old entries;
  they cost a little waste until the next failed send clears them.
- A muted channel still suppresses the push unless the message mentions you
  (`muteNotifications` in `users/{uid}/channelPreferences/{channelId}`) — check
  this before concluding push is broken.
- `POST_NOTIFICATIONS` is declared for Android 13+, and permission is requested
  at sign-in. A user who declined it gets nothing; Android offers no second
  prompt, so they must enable it in system settings.
