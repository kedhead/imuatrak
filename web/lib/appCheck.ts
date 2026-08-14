/**
 * Firebase App Check for the web client.
 *
 * App Check attaches an attestation token to every Firestore, Storage and
 * Functions request, so the backend can tell traffic from the real site apart
 * from a script holding the same public config. That config is public by
 * design — it ships in the JS bundle — so without App Check the only thing
 * standing between a scraper and the unauthenticated reads on /join and /s is
 * the security rules, and rules can't distinguish a browser from curl.
 *
 * ── Read this before enabling enforcement ────────────────────────────────────
 *
 * Initializing App Check here is safe and changes nothing on its own. Turning
 * on ENFORCEMENT in the Firebase console is not, and must not be done while the
 * mobile app is in its current shape:
 *
 * App Check enforcement is per-SERVICE (Firestore, Storage, Functions), not
 * per-client. Enabling it for Firestore rejects every request without a valid
 * token — including all traffic from the phone app.
 *
 * The phone app uses the Firebase JS SDK (see src/services/firebase.ts), whose
 * only App Check provider is reCAPTCHA, which is browser-only. There is no
 * DeviceCheck or Play Integrity provider in the JS SDK; those require
 * @react-native-firebase, a different native stack. So the mobile app cannot
 * produce App Check tokens today at any amount of configuration.
 *
 * Enforcement therefore stays OFF until the mobile client can attest. Monitor
 * mode still earns its keep in the meantime: the console reports what share of
 * web traffic is unverified, which is the measurement that tells you whether
 * scripted abuse is actually happening. See docs/cost-controls.md.
 */
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import type { FirebaseApp } from "firebase/app";

let started = false;

/**
 * Start App Check if a site key is configured. No-ops in every other case, so
 * a deployment without the key behaves exactly as it did before.
 *
 * reCAPTCHA v3 rather than Enterprise: v3 is free, and Enterprise bills per
 * assessment above its free tier — which would mean adding a running cost to
 * a cost-control measure.
 */
export function startAppCheck(app: FirebaseApp): void {
  if (started || typeof window === "undefined") return;

  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (!siteKey) return;

  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      // Lets a returning visitor reuse a token instead of re-attesting on
      // every page load.
      isTokenAutoRefreshEnabled: true,
    });
    started = true;
  } catch (err) {
    // A bad key or a blocked reCAPTCHA script must not take the site down.
    // Unenforced, a missing token costs nothing; enforced, this is the signal
    // that something is misconfigured, so it is logged rather than swallowed.
    console.error("[appCheck] initialization failed", err);
  }
}
