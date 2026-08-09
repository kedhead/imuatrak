/**
 * Club invite links — one place that knows how an invite is spelled, shared
 * and read back.
 *
 * An invite can reach the app in several shapes: the permanent web link, the
 * `imuatrak://` deep link the website bounces through, a QR code holding
 * either of those, or a bare identifier somebody typed in. They all resolve to
 * the same thing — a club document ID, a legacy club slug, or a one-time
 * invite token — so the parsing lives here rather than being re-invented at
 * each entry point.
 */

export const INVITE_BASE_URL = "https://imuatrak.app/join";

export const APP_STORE_URL = "https://apps.apple.com/us/app/imuatrak/id6774396124";
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=app.imuatrak";

/**
 * Identifier charset: Firestore auto-IDs are 20 mixed-case alphanumerics,
 * club slugs are lowercase-and-hyphens, and one-time invite tokens are 12 hex
 * characters. Underscores are allowed so a hand-typed value is never rejected
 * on a technicality.
 */
const IDENTIFIER = /^[A-Za-z0-9_-]{2,64}$/;

/** The permanent, never-expiring invite link for a club. */
export function inviteLink(clubId: string): string {
  return `${INVITE_BASE_URL}/${clubId}`;
}

/**
 * The message body used when sharing an invite out of the app.
 *
 * One link, deliberately. It used to also paste an App Store URL, which sent
 * every Android invitee to a store they can't install from; the join link
 * already handles that case — it opens the app when installed and otherwise
 * lands on the web invite page, which offers the right store for the device.
 */
export function inviteShareMessage(clubName: string, link: string): string {
  return (
    `Join ${clubName} on ImuaTrak!\n\n${link}\n\n` +
    `Open it on your phone — it'll take you straight into the app, ` +
    `or to the download if you don't have it yet.`
  );
}

/**
 * Pull a club identifier out of whatever the user pasted, typed or scanned.
 *
 * Handles the full share message (which also contains an App Store link), a
 * bare link with or without scheme, a link carrying a query string or trailing
 * punctuation, the `imuatrak://club/join?slug=…` deep link, and a plain
 * ID/slug/code. Returns null when there is nothing invite-shaped in the input,
 * so callers can tell "no identifier" from "identifier that didn't resolve".
 */
export function extractInviteIdentifier(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;

  // Deep link — the website's "Open in ImuaTrak" button and any QR holding it.
  const deep = text.match(/imuatrak:\/\/\S*[?&](?:slug|code)=([A-Za-z0-9_%-]+)/i);
  if (deep?.[1]) {
    const decoded = decodeURIComponent(deep[1]);
    return IDENTIFIER.test(decoded) ? decoded : null;
  }

  // Web link, anywhere inside a longer body of text. Matching on the path
  // rather than the whole URL means a trailing "?utm=…", a closing paren, or a
  // sentence continuing after the link all come out clean.
  const web = text.match(/imuatrak\.app\/join\/([A-Za-z0-9_-]+)/i);
  if (web?.[1]) return web[1];

  // A bare identifier, but only when it is the ENTIRE input — otherwise a
  // pasted paragraph could match some unrelated word and join the wrong club.
  if (IDENTIFIER.test(text)) return text;

  return null;
}

/** True when the text looks like an ImuaTrak invite (used for clipboard prefill). */
export function looksLikeInvite(raw: string | null | undefined): boolean {
  const text = (raw ?? "").trim();
  if (!text) return false;
  return /imuatrak\.app\/join\//i.test(text) || /imuatrak:\/\/\S*[?&](?:slug|code)=/i.test(text);
}
