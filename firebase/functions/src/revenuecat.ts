/**
 * Club plan billing (RevenueCat) — PARKED, not deployed.
 *
 * This module is intentionally NOT imported by index.ts, so its functions are
 * not part of the deployed backend. It is parked rather than deleted because
 * the code is complete and correct; only its configuration is missing.
 *
 * Why: revenuecatWebhook and syncClubPlan declare two secrets via
 * defineSecret(). The Firebase CLI resolves EVERY declared secret while it
 * analyses the codebase, BEFORE it works out which functions to deploy — so a
 * secret that does not exist in Secret Manager fails the entire deploy, all
 * functions included. Neither secret was ever created, so this code has never
 * reached production and no deploy has succeeded since it landed (2026-08-02).
 *
 * Nothing regresses by parking it. In-app purchases go through the
 * react-native-purchases SDK talking to RevenueCat directly, using the public
 * appl_/goog_ keys; no Cloud Function sits in that path. What stays unbuilt is
 * the server-side projection of the "club" entitlement onto the club document,
 * which has never worked in production anyway. The app's call site already
 * tolerates it — syncClubPlanWithBackend() in src/services/subscriptionStore.ts
 * swallows the error.
 *
 * To turn it back on:
 *   1. Create both secrets in Secret Manager (project imuatrak):
 *        REVENUECAT_WEBHOOK_AUTH     the exact Authorization header value
 *                                    RevenueCat is configured to send
 *        REVENUECAT_SECRET_API_KEY   RevenueCat secret API key (sk_...)
 *      Either `firebase functions:secrets:set <NAME>` or the Cloud Console.
 *   2. Re-export from index.ts:
 *        export { revenuecatWebhook, syncClubPlan } from "./revenuecat";
 *   3. Point the RevenueCat dashboard webhook at the deployed function URL.
 */

import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

const revenuecatWebhookAuth = defineSecret("REVENUECAT_WEBHOOK_AUTH");
const revenuecatApiKey = defineSecret("REVENUECAT_SECRET_API_KEY");

const CLUB_ENTITLEMENT = "club";

/**
 * The club a payer's plan applies to: the club they own, else the first club
 * where they're an admin (looked up through their userClubs index — no
 * collection-group indexes needed).
 */
async function findClubForPayer(
  uid: string,
): Promise<FirebaseFirestore.DocumentSnapshot | null> {
  const db = getFirestore();
  const owned = await db.collection("clubs").where("ownerId", "==", uid).limit(1).get();
  if (!owned.empty) return owned.docs[0] ?? null;

  const idx = await db.doc(`userClubs/${uid}`).get();
  const clubIds = (idx.data() as { clubIds?: string[] } | undefined)?.clubIds ?? [];
  for (const clubId of clubIds) {
    const member = await db.doc(`clubs/${clubId}/members/${uid}`).get();
    const role = (member.data() as { role?: string } | undefined)?.role;
    if (role === "owner" || role === "admin") {
      return await db.doc(`clubs/${clubId}`).get();
    }
  }
  return null;
}

async function activateClubPlan(
  uid: string,
  productId: string | null,
  renewsAt: string | null,
): Promise<string | null> {
  const clubSnap = await findClubForPayer(uid);
  if (!clubSnap || !clubSnap.exists) {
    console.log(`activateClubPlan: no owned/admin club for ${uid}`);
    return null;
  }
  await clubSnap.ref.update({
    subscriptionStatus: "active",
    subscriptionRenewsAt: renewsAt ?? FieldValue.delete(),
    clubPlan: {
      payerUid: uid,
      productId: productId ?? null,
      activatedAt: new Date().toISOString(),
    },
  });
  console.log(`activateClubPlan: club ${clubSnap.id} active via ${uid}`);
  return clubSnap.id;
}

/**
 * Revert any club this payer's plan was keeping active. Falls back to "trial"
 * if the club's original trial window is somehow still open, else "expired".
 * clubPlan is kept on the doc (with the payer) for support/debugging.
 */
async function deactivateClubPlan(uid: string): Promise<number> {
  const db = getFirestore();
  const snap = await db.collection("clubs").where("clubPlan.payerUid", "==", uid).get();
  const now = new Date().toISOString();
  let reverted = 0;
  for (const d of snap.docs) {
    const data = d.data() as { subscriptionStatus?: string; trialEndsAt?: string };
    if (data.subscriptionStatus !== "active") continue;
    const backToTrial = typeof data.trialEndsAt === "string" && data.trialEndsAt > now;
    await d.ref.update({
      subscriptionStatus: backToTrial ? "trial" : "expired",
      subscriptionRenewsAt: FieldValue.delete(),
    });
    reverted++;
    console.log(`deactivateClubPlan: club ${d.id} → ${backToTrial ? "trial" : "expired"}`);
  }
  return reverted;
}

// Webhook event types that mean the entitlement is (still) paid for vs gone.
// CANCELLATION only means auto-renew was turned off — access runs until the
// term ends, so the club stays active until EXPIRATION arrives.
const CLUB_ACTIVATE_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "NON_RENEWING_PURCHASE",
]);
const CLUB_DEACTIVATE_EVENTS = new Set(["EXPIRATION"]);

interface RevenueCatEvent {
  type?: string;
  app_user_id?: string;
  aliases?: string[];
  entitlement_ids?: string[] | null;
  product_id?: string;
  expiration_at_ms?: number;
}

export const revenuecatWebhook = onRequest(
  { secrets: [revenuecatWebhookAuth] },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("POST only");
      return;
    }
    const expected = revenuecatWebhookAuth.value();
    if (!expected || req.get("Authorization") !== expected) {
      res.status(401).send("Unauthorized");
      return;
    }

    const event = (req.body as { event?: RevenueCatEvent } | undefined)?.event;
    if (!event?.type) {
      res.status(400).send("No event");
      return;
    }

    const entitlements = event.entitlement_ids ?? [];
    if (!entitlements.includes(CLUB_ENTITLEMENT)) {
      // Personal (ad-free) plans need no server-side action.
      res.status(200).json({ handled: false, reason: "not a club entitlement" });
      return;
    }

    // app_user_id is the Firebase uid (the app calls Purchases.logIn(uid)).
    // Fall back to aliases for events attributed to a pre-login anonymous ID.
    const candidates = [event.app_user_id, ...(event.aliases ?? [])].filter(
      (id): id is string => typeof id === "string" && !id.startsWith("$RCAnonymousID:"),
    );
    const uid = candidates[0];
    if (!uid) {
      res.status(200).json({ handled: false, reason: "no resolvable app_user_id" });
      return;
    }

    if (CLUB_ACTIVATE_EVENTS.has(event.type)) {
      const renewsAt = event.expiration_at_ms
        ? new Date(event.expiration_at_ms).toISOString()
        : null;
      const clubId = await activateClubPlan(uid, event.product_id ?? null, renewsAt);
      res.status(200).json({ handled: true, clubId });
    } else if (CLUB_DEACTIVATE_EVENTS.has(event.type)) {
      const reverted = await deactivateClubPlan(uid);
      res.status(200).json({ handled: true, reverted });
    } else {
      res.status(200).json({ handled: false, reason: `ignored event ${event.type}` });
    }
  },
);

export const syncClubPlan = onCall({ secrets: [revenuecatApiKey] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign-in required");

  const apiKey = revenuecatApiKey.value();
  if (!apiKey) throw new HttpsError("failed-precondition", "RevenueCat API key not configured");

  const rcRes = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!rcRes.ok) {
    throw new HttpsError("unavailable", `RevenueCat lookup failed (${rcRes.status})`);
  }
  const body = (await rcRes.json()) as {
    subscriber?: {
      entitlements?: Record<
        string,
        { expires_date?: string | null; product_identifier?: string }
      >;
    };
  };

  const ent = body.subscriber?.entitlements?.[CLUB_ENTITLEMENT];
  const active =
    !!ent && (ent.expires_date == null || new Date(ent.expires_date) > new Date());

  if (active) {
    const clubId = await activateClubPlan(uid, ent.product_identifier ?? null, ent.expires_date ?? null);
    if (!clubId) {
      throw new HttpsError(
        "failed-precondition",
        "No club found where you're an owner or admin",
      );
    }
    return { status: "activated", clubId };
  }

  const reverted = await deactivateClubPlan(uid);
  return { status: reverted > 0 ? "reverted" : "no_change" };
});
