# Subscriptions setup

Three products, mapped onto the offering/entitlement architecture the app
already ships. Most of the work here is **dashboard configuration** (App Store
Connect, Google Play, RevenueCat) — the app code already supports this shape.

## The three plans

| # | Plan | What it unlocks | Price | RevenueCat offering | RevenueCat entitlement |
|---|------|-----------------|-------|---------------------|------------------------|
| 1 | **Personal — remove my ads** | Ad-free for the buyer only. No club features. | **$1.99 / month** | `default` (the "Current" offering) | `app.imuatrak.plus.monthly` |
| 2 | **Club — monthly** | All club features + ad-free for **every** member of the buyer's club. | **$5.99 / month** | `club` | `club` |
| 3 | **Club — annual** | Same as #2, billed yearly. | (your yearly price) | `club` | `club` |

Key idea: the **personal** plan grants ad-free directly through the RevenueCat
SDK (no server needed). The **club** plans grant the buyer the `club`
entitlement, and a Cloud Function projects that onto the club document
(`subscriptionStatus: "active"`), which is what makes every member ad-free and
unlocks Pro features. **That Cloud Function is currently not deployed — see
"Club backend" below. Until it is, plans #2 and #3 do nothing for members.**

## Store products

Use whatever product IDs you like; these are a clean scheme.

| Plan | Suggested store product ID | Duration | Notes |
|------|---------------------------|----------|-------|
| 1 Personal | `app.imuatrak.plus.month` (already exists) | 1 month | Set price to **$1.99**. |
| 2 Club monthly | `app.imuatrak.club.month` (new) | 1 month | Set price to **$5.99**. |
| 3 Club annual | `app.imuatrak.club.annual` (new) | 1 year | Your chosen yearly price. |

Do the same in **Google Play** (Play Console → Monetize → Subscriptions), same
product IDs, matching prices.

### Cleanup of the current App Store Connect products
- `app.imuatrak.plus.annual` ("Yearly") — there is **no personal annual** in
  this plan. Remove it from the personal offering. Deactivate it, or just leave
  it unattached to any offering so it is never sold.
- `no_club` ("No Ads!") — the legacy personal no-ads product. If it has live
  subscribers, keep it **attached to the `app.imuatrak.plus.monthly`
  entitlement** so those users stay ad-free, but keep it **out of every
  offering** so it is not sold to new users. If it has no subscribers, deactivate it.

## RevenueCat wiring

1. **Products** → import all store products above.
2. **Entitlements**
   - `app.imuatrak.plus.monthly` → attach the **personal monthly** ($1.99).
     (Also attach the legacy `no_club` here if it has subscribers.)
   - `club` → attach **both** club products (monthly + annual).
3. **Offerings**
   - `default` (mark **Current**) → one package: the personal monthly.
   - `club` → two packages: club monthly + club annual.

> The app reads personal plans from `offerings.current` and club plans from
> `offerings.all["club"]`. Entitlement IDs the app accepts as ad-free:
> `ad_free`, `app.imuatrak.plus.monthly`, `club` (see
> `src/services/subscriptionStore.ts`). The club entitlement must be exactly
> `club`.

## Club backend (MUST be deployed for plans #2 and #3)

`firebase/functions/src/revenuecat.ts` holds `syncClubPlan` (called by the app
right after a club purchase) and `revenuecatWebhook` (RevenueCat → server, for
renewals/cancellations). Both are **parked**: not exported from `index.ts`, so
not deployed. Without them, a club purchase charges the card but the club is
never flipped to active, so members get nothing.

It is parked because both functions declare secrets via `defineSecret()`, and
the Firebase CLI fails the **entire** deploy if a declared secret is missing
from Secret Manager. So the order matters:

1. **Create both secrets** in Secret Manager (project `imuatrak`):
   - `REVENUECAT_WEBHOOK_AUTH` — the exact `Authorization` header value you will
     configure RevenueCat's webhook to send.
   - `REVENUECAT_SECRET_API_KEY` — a RevenueCat **secret** API key (`sk_...`).

   `firebase functions:secrets:set <NAME>` or the Cloud Console.
2. **Re-export** from `index.ts`:
   `export { revenuecatWebhook, syncClubPlan } from "./revenuecat";`
   (Do this only after step 1, or every function deploy fails.)
3. **Deploy**: `npm run deploy:functions`.
4. **Point the RevenueCat webhook** at the deployed `revenuecatWebhook` URL, with
   the same `Authorization` value stored in `REVENUECAT_WEBHOOK_AUTH`.

## Testing

- The **personal** plan can be tested by any Sandbox tester who is **not** in a
  club (a club member is already ad-free, so the paywall correctly offers them
  nothing to buy).
- The **club** plan is offered only to a club **owner/admin** whose club is not
  already on a paid plan.
- After buying the club plan, confirm the club document's `subscriptionStatus`
  becomes `active` (proves the backend projection ran).
