/**
 * Club plan billing (RevenueCat).
 *
 * A club plan is a "club" entitlement on the payer's RevenueCat customer
 * (app_user_id = Firebase uid). This module projects that entitlement onto ONE
 * club document — subscriptionStatus "active" plus a clubPlan record — which is
 * what makes every member ad-free and unlocks the club features.
 *
 * Which club: the one the payer was looking at when they bought. The app sends
 * it to syncClubPlan right after the purchase, and syncClubPlan stores it on the
 * RevenueCat customer as the "clubId" subscriber attribute so that later
 * webhook events (renewals, expiry) resolve to the same club without the app.
 *
 * RevenueCat is the source of truth. Both entry points end in
 * reconcileClubPlan(), which reads the customer from RevenueCat and makes
 * Firestore match: the webhook is only a "something changed for this user"
 * signal. That covers events that don't mention the club entitlement at all,
 * e.g. a downgrade from the club plan to the personal one in the same App Store
 * subscription group, whose RENEWAL lists only the personal entitlement.
 *
 * Both functions need these secrets in Secret Manager (project imuatrak). A
 * missing secret fails the ENTIRE functions deploy, so create them first:
 *   REVENUECAT_WEBHOOK_AUTH     the exact Authorization header value RevenueCat's
 *                               webhook is configured to send
 *   REVENUECAT_SECRET_API_KEY   a RevenueCat V1 secret API key (sk_...)
 */

import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

const revenuecatWebhookAuth = defineSecret("REVENUECAT_WEBHOOK_AUTH");
const revenuecatApiKey = defineSecret("REVENUECAT_SECRET_API_KEY");

const CLUB_ENTITLEMENT = "club";
const CLUB_ID_ATTRIBUTE = "clubId";
const RC_API = "https://api.revenuecat.com/v1";

interface RevenueCatSubscriber {
  entitlements?: Record<
    string,
    {
      expires_date?: string | null;
      grace_period_expires_date?: string | null;
      product_identifier?: string;
    }
  >;
  subscriber_attributes?: Record<string, { value?: string }>;
}

async function fetchSubscriber(uid: string, apiKey: string): Promise<RevenueCatSubscriber> {
  const res = await fetch(`${RC_API}/subscribers/${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`RevenueCat lookup failed (${res.status})`);
  const body = (await res.json()) as { subscriber?: RevenueCatSubscriber };
  return body.subscriber ?? {};
}

async function setClubIdAttribute(uid: string, clubId: string, apiKey: string): Promise<void> {
  const res = await fetch(`${RC_API}/subscribers/${encodeURIComponent(uid)}/attributes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ attributes: { [CLUB_ID_ATTRIBUTE]: { value: clubId } } }),
  });
  if (!res.ok) throw new Error(`RevenueCat attribute write failed (${res.status})`);
}

/** The active club entitlement, or null. A billing grace period counts as active. */
function activeClubEntitlement(sub: RevenueCatSubscriber) {
  const ent = sub.entitlements?.[CLUB_ENTITLEMENT];
  if (!ent) return null;
  // A present entitlement with no expiry never expires.
  if (ent.expires_date == null) return { ...ent, renewsAt: null };
  const end = Math.max(
    new Date(ent.expires_date).getTime(),
    ent.grace_period_expires_date ? new Date(ent.grace_period_expires_date).getTime() : 0,
  );
  return end > Date.now() ? { ...ent, renewsAt: ent.expires_date } : null;
}

async function isOwnerOrAdmin(uid: string, clubId: string): Promise<boolean> {
  const member = await getFirestore().doc(`clubs/${clubId}/members/${uid}`).get();
  const role = (member.data() as { role?: string } | undefined)?.role;
  return role === "owner" || role === "admin";
}

/**
 * The clubs the payer owns or admins. Used only when nothing names the club
 * (a purchase made before this code shipped): if there's exactly one, that's
 * unambiguous; with several, guessing could upgrade the wrong club.
 */
async function eligibleClubIds(uid: string): Promise<string[]> {
  const idx = await getFirestore().doc(`userClubs/${uid}`).get();
  const clubIds = (idx.data() as { clubIds?: string[] } | undefined)?.clubIds ?? [];
  const checks = await Promise.all(clubIds.map((id) => isOwnerOrAdmin(uid, id)));
  return clubIds.filter((_, i) => checks[i]);
}

/** Clubs this payer's plan currently marks active. */
async function clubsPaidBy(uid: string) {
  const snap = await getFirestore().collection("clubs").where("clubPlan.payerUid", "==", uid).get();
  return snap.docs.filter(
    (d) => (d.data() as { subscriptionStatus?: string }).subscriptionStatus === "active",
  );
}

/**
 * Revert a club the payer's plan was keeping active. Falls back to "trial" if
 * the club's original trial window is somehow still open, else "expired".
 * clubPlan is kept on the doc (with the payer) for support/debugging.
 */
async function revertClub(ref: FirebaseFirestore.DocumentReference): Promise<void> {
  const data = (await ref.get()).data() as { trialEndsAt?: string } | undefined;
  const backToTrial =
    typeof data?.trialEndsAt === "string" && data.trialEndsAt > new Date().toISOString();
  await ref.update({
    subscriptionStatus: backToTrial ? "trial" : "expired",
    subscriptionRenewsAt: FieldValue.delete(),
  });
  console.log(`revertClub: club ${ref.id} → ${backToTrial ? "trial" : "expired"}`);
}

type ReconcileResult =
  | { status: "activated"; clubId: string }
  | { status: "reverted"; reverted: number }
  | { status: "no_change" }
  | { status: "no_club"; reason: string };

/**
 * Make Firestore match the payer's RevenueCat state.
 *
 * requestedClubId comes from the app (the club whose paywall the purchase was
 * made from); the server checks the caller is that club's owner or admin.
 */
async function reconcileClubPlan(
  uid: string,
  apiKey: string,
  requestedClubId?: string,
): Promise<ReconcileResult> {
  const db = getFirestore();
  const sub = await fetchSubscriber(uid, apiKey);
  const ent = activeClubEntitlement(sub);
  const paid = await clubsPaidBy(uid);

  if (!ent) {
    for (const d of paid) await revertClub(d.ref);
    return paid.length > 0 ? { status: "reverted", reverted: paid.length } : { status: "no_change" };
  }

  // Which club: the one the app names, else the one stored on the customer,
  // else the one this plan already covers, else the payer's only club.
  let clubId: string | undefined;
  if (requestedClubId) {
    if (!(await isOwnerOrAdmin(uid, requestedClubId))) {
      return { status: "no_club", reason: "not an owner or admin of that club" };
    }
    clubId = requestedClubId;
    if (sub.subscriber_attributes?.[CLUB_ID_ATTRIBUTE]?.value !== clubId) {
      await setClubIdAttribute(uid, clubId, apiKey);
    }
  } else {
    const stored = sub.subscriber_attributes?.[CLUB_ID_ATTRIBUTE]?.value;
    if (stored && (paid.some((d) => d.id === stored) || (await isOwnerOrAdmin(uid, stored)))) {
      clubId = stored;
    } else if (paid.length > 0) {
      clubId = paid[0]?.id;
    } else {
      const eligible = await eligibleClubIds(uid);
      if (eligible.length === 1) clubId = eligible[0];
      else {
        return {
          status: "no_club",
          reason: eligible.length === 0 ? "no owned/admin club" : "several clubs; none named",
        };
      }
    }
  }
  if (!clubId) return { status: "no_club", reason: "no club resolved" };

  // One subscription pays for one club: release any other club it covered.
  for (const d of paid) if (d.id !== clubId) await revertClub(d.ref);

  await db.doc(`clubs/${clubId}`).update({
    subscriptionStatus: "active",
    subscriptionRenewsAt: ent.renewsAt ?? FieldValue.delete(),
    clubPlan: {
      payerUid: uid,
      productId: ent.product_identifier ?? null,
      activatedAt: new Date().toISOString(),
    },
  });
  console.log(`reconcileClubPlan: club ${clubId} active via ${uid}`);
  return { status: "activated", clubId };
}

interface RevenueCatEvent {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  transferred_from?: string[];
  transferred_to?: string[];
}

const isRealUserId = (id: unknown): id is string =>
  typeof id === "string" && !id.startsWith("$RCAnonymousID:");

export const revenuecatWebhook = onRequest(
  { secrets: [revenuecatWebhookAuth, revenuecatApiKey] },
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
    if (event.type === "TEST") {
      res.status(200).json({ handled: false, reason: "test event" });
      return;
    }

    // app_user_id is the Firebase uid (the app calls Purchases.logIn(uid)).
    // Fall back to aliases for events attributed to a pre-login anonymous ID.
    // A TRANSFER has no app_user_id: both sides changed, so reconcile both.
    const uids =
      event.type === "TRANSFER"
        ? [...(event.transferred_from ?? []), ...(event.transferred_to ?? [])].filter(isRealUserId)
        : [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])]
            .filter(isRealUserId)
            .slice(0, 1);
    if (uids.length === 0) {
      res.status(200).json({ handled: false, reason: "no resolvable app_user_id" });
      return;
    }

    try {
      const results = [];
      for (const uid of new Set(uids)) {
        results.push({ uid, ...(await reconcileClubPlan(uid, revenuecatApiKey.value())) });
      }
      res.status(200).json({ handled: true, results });
    } catch (e) {
      // 5xx makes RevenueCat retry the delivery later.
      console.error(`revenuecatWebhook: reconcile failed for ${uids.join(", ")}`, e);
      res.status(503).send("Reconcile failed");
    }
  },
);

export const syncClubPlan = onCall({ secrets: [revenuecatApiKey] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign-in required");

  const apiKey = revenuecatApiKey.value();
  if (!apiKey) throw new HttpsError("failed-precondition", "RevenueCat API key not configured");

  const raw = (request.data as { clubId?: unknown } | undefined)?.clubId;
  const clubId = typeof raw === "string" && raw.length > 0 ? raw : undefined;

  let result: ReconcileResult;
  try {
    result = await reconcileClubPlan(uid, apiKey, clubId);
  } catch (e) {
    throw new HttpsError("unavailable", e instanceof Error ? e.message : "RevenueCat lookup failed");
  }
  if (result.status === "no_club" && clubId) {
    throw new HttpsError("permission-denied", "Only a club owner or admin can activate its plan");
  }
  return result;
});
