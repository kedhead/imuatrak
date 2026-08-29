/**
 * End-to-end check of garminIngest against in-memory stubs for Firestore and
 * Storage. Run it after touching src/garmin.ts:
 *
 *   cd firebase/functions && npm run check:garmin
 *
 * A plain script rather than a Jest suite because the functions package has no
 * test setup and the root Jest run is a React Native (jest-expo) environment
 * that cannot load firebase-functions. Node and a `tsc` build are all it needs.
 */
const Module = require("module");
const path = require("path");

// ── in-memory Firestore ──────────────────────────────────────────────────────
const store = new Map(); // "collection/doc" -> data
const files = new Map();

function docRef(collection, id) {
  const key = `${collection}/${id}`;
  return {
    id,
    key,
    async get() {
      const data = store.get(key);
      return { exists: data !== undefined, id, data: () => data, ref: this };
    },
    async set(data) { store.set(key, data); },
    async create(data) {
      if (store.has(key)) throw new Error("already exists");
      store.set(key, data);
    },
    async update(patch) {
      if (!store.has(key)) throw new Error("missing");
      store.set(key, { ...store.get(key), ...patch });
    },
    async delete() { store.delete(key); },
    collection: (sub) => collectionRef(`${key}/${sub}`),
  };
}

function collectionRef(name) {
  return {
    doc: (id) => docRef(name, id),
    where: (field, _op, value) => ({
      async get() {
        const docs = [];
        for (const [key, data] of store) {
          const [coll, id] = [key.slice(0, key.lastIndexOf("/")), key.slice(key.lastIndexOf("/") + 1)];
          if (coll === name && data[field] === value) docs.push({ id, data: () => data });
        }
        return { docs, empty: docs.length === 0 };
      },
    }),
  };
}

const firestore = {
  collection: collectionRef,
  doc: (p) => docRef(p.slice(0, p.lastIndexOf("/")), p.slice(p.lastIndexOf("/") + 1)),
  async runTransaction(fn) {
    return fn({
      get: (ref) => ref.get(),
      set: (ref, data) => ref.set(data),
      update: (ref, patch) => ref.update(patch),
      delete: (ref) => ref.delete(),
    });
  },
};

// ── module stubs ─────────────────────────────────────────────────────────────
const stubs = {
  "firebase-admin/firestore": {
    getFirestore: () => firestore,
    FieldValue: { increment: (n) => ({ __increment: n }) },
  },
  "firebase-admin/storage": {
    getStorage: () => ({
      bucket: () => ({
        file: (p) => ({ async save(contents) { files.set(p, contents); } }),
      }),
    }),
  },
};

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (stubs[request]) return request;
  return originalResolve.call(this, request, ...rest);
};
for (const [name, exports] of Object.entries(stubs)) {
  require.cache[name] = { id: name, filename: name, loaded: true, exports };
}

const compiled = path.join(__dirname, "..", "lib", "garmin.js");
try {
  require.resolve(compiled);
} catch {
  console.error("lib/garmin.js not found — run `npm run build` first.");
  process.exit(1);
}
const { garminIngest } = require(compiled);

// ── harness ──────────────────────────────────────────────────────────────────
function call(handler, body) {
  return new Promise((resolve) => {
    const req = { method: "POST", body, rawBody: Buffer.from(JSON.stringify(body)) };
    const res = {
      statusCode: 0,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ code: this.statusCode, body: payload }); },
      set() { return this; },
      send() { resolve({ code: this.statusCode }); },
    };
    handler(req, res);
  });
}

function session(id) {
  return {
    id,
    schemaVersion: 1,
    appVersion: "1.0.3",
    craftType: "OC1",
    startedAt: "2026-08-29T17:00:00Z",
    endedAt: "2026-08-29T18:00:00Z",
    totals: { distanceMeters: 10500.5, durationSec: 3600, strokeCount: 3200 },
    hr: { avg: 142, max: 171, zones: [{ zone: 0, minBpm: 0, maxBpm: 120, timeSec: 300 }] },
    splits: [{ index: 0, distanceM: 1000, durationSec: 340, avgHr: 140, avgStrokeRate: 54, avgSpeedMps: 2.9 }],
    sideSwitches: [],
    trackSummary: [],
    // Things a hostile watch might try to set:
    userId: "someone-else",
    isPublic: true,
    source: "ios-phone",
    admin: true,
  };
}

const track = Array.from({ length: 400 }, (_, i) => ({
  t: i, lat: 21.2756 + i * 1e-5, lon: -157.8295, altM: 1, speedMps: 2.8, hr: 140 + (i % 10),
}));

let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : "  <- " + JSON.stringify(detail)}`);
  if (!ok) failures++;
}

(async () => {
  // A pairing code, as createGarminPairingCode would have written it.
  store.set("garminPairing/123456", {
    uid: "user-1",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 900000).toISOString(),
  });

  let r = await call(garminIngest, { pairingCode: "123456", deviceName: "fenix7", session: session("abc-1"), track });
  check("pairing redeem returns a token", r.code === 200 && typeof r.body.token === "string", r);
  const token = r.body.token;

  const doc = store.get("users/user-1/sessions/abc-1");
  check("session written for the paired uid", !!doc, [...store.keys()]);
  check("userId is the real owner, not the uploaded one", doc.userId === "user-1", doc.userId);
  check("source forced to garmin", doc.source === "garmin", doc.source);
  check("isPublic forced false", doc.isPublic === false, doc.isPublic);
  check("unknown keys dropped", doc.admin === undefined, Object.keys(doc));
  check("trackSummary downsampled to 200", doc.trackSummary.length === 200, doc.trackSummary.length);
  check("full track stored", files.has("users/user-1/garminTracks/abc-1.json"), [...files.keys()]);
  check("stored track keeps every point", JSON.parse(files.get("users/user-1/garminTracks/abc-1.json")).length === 400);
  check("pairing code consumed", !store.has("garminPairing/123456"));

  r = await call(garminIngest, { token, session: session("abc-2"), track: track.slice(0, 10) });
  check("token upload accepted", r.code === 200 && r.body.status === "ok", r);

  r = await call(garminIngest, { token, session: session("abc-2"), track: track.slice(0, 10) });
  check("replay is a no-op duplicate", r.code === 200 && r.body.status === "duplicate", r);

  r = await call(garminIngest, { token: "wrong", session: session("abc-3"), track: [] });
  check("unknown token rejected", r.code === 401, r);

  r = await call(garminIngest, { pairingCode: "999999", session: session("abc-4"), track: [] });
  check("unknown pairing code rejected", r.code === 401, r);

  r = await call(garminIngest, { token, session: { ...session("abc-5"), craftType: "CANOE" }, track: [] });
  check("bad craftType rejected", r.code === 400, r);

  r = await call(garminIngest, { token, session: { ...session("../../etc/passwd"), }, track: [] });
  check("path-traversal id rejected", r.code === 400, r);

  r = await call(garminIngest, { token, session: { ...session("abc-6"), schemaVersion: 2 }, track: [] });
  check("wrong schemaVersion rejected", r.code === 400, r);

  r = await call(garminIngest, { token, session: session("abc-7"), track: new Array(600).fill(track[0]) });
  check("over-long track rejected", r.code === 400, r);

  r = await call(garminIngest, {
    token,
    session: session("abc-8"),
    track: [{ t: 0, lat: 999, lon: 0, altM: 0, speedMps: 0 }, track[0]],
  });
  check("out-of-range coordinates dropped", r.code === 200
    && store.get("users/user-1/sessions/abc-8").trackSummary.length === 1, r);

  // Rate limit: the link doc counts uploads in a rolling window.
  const linkKey = [...store.keys()].find((k) => k.startsWith("garminLinks/"));
  store.set(linkKey, { ...store.get(linkKey), rateWindowStartAt: new Date().toISOString(), rateWindowCount: 20 });
  r = await call(garminIngest, { token, session: session("abc-9"), track: [] });
  check("rate limit enforced", r.code === 429, r);

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
