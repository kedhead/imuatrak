# Ads & ImuaTrak+ Subscription Setup

Quick reference for completing the manual steps to go live with AdMob ads and RevenueCat subscriptions.

---

## 1. Google AdMob

**Goal:** Get your app IDs and banner ad unit IDs.

1. Go to [admob.google.com](https://admob.google.com) and sign in with your Google account.
2. Click **Add app** twice — once for iOS, once for Android. Select "No" for "Is the app listed on a supported app store?" until you publish.
3. Copy the two **App IDs** — they look like `ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX`.
4. Inside each app, go to **Ad units → Add ad unit → Banner**. Name it something like "Sessions Banner". Copy the **Ad Unit ID** — looks like `ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX`.

Add to your `.env`:
```
ADMOB_IOS_APP_ID=ca-app-pub-...~...
ADMOB_ANDROID_APP_ID=ca-app-pub-...~...
EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID_IOS=ca-app-pub-.../...
EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID_ANDROID=ca-app-pub-.../...
```

> **Testing without real IDs:** The app falls back to Google's official test IDs automatically when the env vars are missing, so banners will show in development builds even before you fill these in.

---

## 2. App Store Connect — Subscription Product (iOS)

**Goal:** Create the subscription product that RevenueCat will sell.

1. Open [App Store Connect](https://appstoreconnect.apple.com) → your app → **Monetization → Subscriptions**.
2. Create a **Subscription Group** (e.g. "ImuaTrak+ Access").
3. Add a subscription inside the group:
   - **Product ID:** `app.imuatrak.plus.monthly` (or similar — note it down, you'll need it in RevenueCat)
   - **Duration:** 1 Month
   - **Price:** your choice (e.g. $1.99/mo)
   - Fill in the display name and description for all required locales.
4. Submit for review (App Store reviews subscription products before they go live).

---

## 3. Google Play Console — Subscription Product (Android)

**Goal:** Same product on the Android side.

1. Open [Play Console](https://play.google.com/console) → your app → **Monetize → Subscriptions**.
2. Click **Create subscription**:
   - **Product ID:** `app.imuatrak.plus.monthly` (use the same ID as iOS for simplicity)
   - **Name/description:** match what you used in App Store Connect
   - Add a **Base plan**: recurring, monthly, your price.
3. Activate the subscription.

---

## 4. RevenueCat

**Goal:** Wire both store products to a single entitlement the app checks.

1. Go to [app.revenuecat.com](https://app.revenuecat.com) and create a new **Project**.
2. Add two apps inside the project — one iOS (paste your App Store Connect bundle ID `app.imuatrak`), one Android (paste `app.imuatrak`).
3. Under each app, go to **Products** and add the product ID from the store (`app.imuatrak.plus.monthly`).
4. Go to **Entitlements → New entitlement**:
   - **Identifier:** `ad_free` ← must match exactly what's in the code
   - Attach the product(s) you just created.
5. Go to **Offerings → New offering** (use identifier `default`):
   - Add a **Package** (identifier `$rc_monthly`), attach the product.
6. Copy your **API keys** from the app settings pages (one for iOS, one for Android).

Add to your `.env`:
```
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_...
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_...
```

---

## 5. Build & Test

```bash
# Trigger a new EAS development build after filling in .env
eas build --profile development --platform ios
eas build --profile development --platform android
```

**Smoke test checklist:**
- [ ] Banner ad appears on Sessions tab and Stats tab for a signed-in user with no subscription
- [ ] Banner is absent for a user whose club has `subscriptionStatus: "trial"` or `"active"` in Firestore
- [ ] Settings → ImuaTrak+ shows "Remove Ads" row → taps through to paywall
- [ ] Paywall displays the monthly price fetched from RevenueCat
- [ ] Sandbox purchase (App Store sandbox / Google Play test account) → banner disappears without restart
- [ ] Force-kill and reopen → banner stays gone (entitlement persisted)
- [ ] "Restore purchases" in Settings works for a sandbox account that already purchased

---

## Environment Variable Summary

| Variable | Where to get it |
|---|---|
| `ADMOB_IOS_APP_ID` | AdMob → Apps → iOS app → App ID |
| `ADMOB_ANDROID_APP_ID` | AdMob → Apps → Android app → App ID |
| `EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID_IOS` | AdMob → iOS app → Ad units → Banner |
| `EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID_ANDROID` | AdMob → Android app → Ad units → Banner |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | RevenueCat → Project → iOS app → API keys |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | RevenueCat → Project → Android app → API keys |
