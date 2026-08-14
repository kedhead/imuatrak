/**
 * Minimal Firestore REST reader for public, unauthenticated documents.
 *
 * The `/s/[id]` viewer is a server component, and it was reading Firestore
 * through the Firebase **Web** SDK — a browser client, running inside a
 * serverless function. The dashboard proves the config is fine: it renders
 * sessions from the same project using the same build-inlined
 * NEXT_PUBLIC_FIREBASE_* values, in the browser. Only the server-rendered
 * pages fail, so the SDK's connection machinery is the thing that does not
 * survive the move to Node.
 *
 * A public document governed by `allow read: if true` needs none of that
 * machinery. One HTTPS GET returns it. That also lets Next cache the
 * response, which the SDK path could not do.
 *
 * The API key here is the same public value already shipped in the client
 * bundle (NEXT_PUBLIC_*); it identifies the project for quota, it is not a
 * secret and grants nothing beyond what the security rules allow.
 */

/** Firestore's typed JSON encoding for a single value. */
type RestValue = {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number | string;
  timestampValue?: string;
  stringValue?: string;
  bytesValue?: string;
  referenceValue?: string;
  geoPointValue?: { latitude?: number; longitude?: number };
  arrayValue?: { values?: RestValue[] };
  mapValue?: { fields?: Record<string, RestValue> };
};

/**
 * Convert one Firestore REST value to plain JS.
 *
 * `integerValue` arrives as a STRING (int64 does not survive JSON), so it has
 * to be coerced or every numeric total silently becomes a string and the
 * arithmetic in the viewer produces NaN.
 */
export function decodeValue(v: RestValue): unknown {
  if (v == null) return null;
  if ("nullValue" in v) return null;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.bytesValue !== undefined) return v.bytesValue;
  if (v.referenceValue !== undefined) return v.referenceValue;
  if (v.geoPointValue !== undefined) {
    return { latitude: v.geoPointValue.latitude ?? 0, longitude: v.geoPointValue.longitude ?? 0 };
  }
  if (v.arrayValue !== undefined) return (v.arrayValue.values ?? []).map(decodeValue);
  if (v.mapValue !== undefined) return decodeFields(v.mapValue.fields ?? {});
  return null;
}

/** Convert a Firestore REST document's `fields` map to a plain object. */
export function decodeFields(fields: Record<string, RestValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v);
  return out;
}

/**
 * GET one document by path (e.g. `publicSessions/abc123`).
 *
 * Returns null when the document does not exist, so callers can tell "no such
 * session" apart from "the read failed" — a 404 is an answer, anything else
 * throws and gets logged by the caller.
 */
export async function getPublicDoc(
  path: string,
  opts: { projectId: string; apiKey: string; revalidateSeconds?: number },
): Promise<Record<string, unknown> | null> {
  const { projectId, apiKey, revalidateSeconds = 60 } = opts;
  if (!projectId) throw new Error("Firestore REST: no projectId configured");

  const encoded = path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/${encoded}` +
    (apiKey ? `?key=${encodeURIComponent(apiKey)}` : "");

  // A miss returns null rather than throwing, which lets the caller cache the
  // "no such session" outcome instead of re-asking Firestore every time. That
  // matters because /s/{id} is the one page reachable without signing in: a
  // crawler walking made-up ids is otherwise a fresh billed lookup per request.
  // The route segment sets its own revalidate so the not-found render is cached
  // too — see the note in app/s/[id]/page.tsx.
  const res = await fetch(url, { next: { revalidate: revalidateSeconds } });
  if (res.status === 404) return null;
  if (!res.ok) {
    // Keep the body: Firestore explains refusals (rules, disabled API, bad
    // key) in it, and that text is the whole diagnosis when this fails.
    throw new Error(`Firestore REST ${res.status} for ${path}: ${await res.text()}`);
  }

  const doc = (await res.json()) as { fields?: Record<string, RestValue> };
  return decodeFields(doc.fields ?? {});
}
