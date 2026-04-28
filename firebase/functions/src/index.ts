import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

initializeApp();

const OPENWEATHER_API_KEY = defineSecret("OPENWEATHER_API_KEY");

// ---------------------------------------------------------------------------
// renderSessionCard — produces a PNG share card (map snapshot + stats overlay)
// for a finished session and stores it at users/{uid}/cards/{sessionId}.png.
// Stub implementation; concrete rendering uses @napi-rs/canvas + a static
// map tile provider, wired up in Phase 4.
// ---------------------------------------------------------------------------
export const renderSessionCard = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign-in required");

  const { sessionId } = request.data ?? {};
  if (typeof sessionId !== "string" || !sessionId) {
    throw new HttpsError("invalid-argument", "sessionId is required");
  }

  const snap = await getFirestore()
    .doc(`users/${uid}/sessions/${sessionId}`)
    .get();
  if (!snap.exists) throw new HttpsError("not-found", "Session not found");

  // TODO(phase-4): render PNG, upload to Storage, return signed URL.
  const path = `users/${uid}/cards/${sessionId}.png`;
  await getStorage().bucket().file(path).save(Buffer.from([]), {
    contentType: "image/png",
  });

  return { path, status: "stub" };
});

// ---------------------------------------------------------------------------
// fetchWeather — server-side proxy to OpenWeather so the API key never ships
// in the Android app. iOS uses WeatherKit directly.
// ---------------------------------------------------------------------------
export const fetchWeather = onCall(
  { secrets: [OPENWEATHER_API_KEY] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign-in required");
    }

    const { lat, lon } = request.data ?? {};
    if (typeof lat !== "number" || typeof lon !== "number") {
      throw new HttpsError("invalid-argument", "lat and lon are required");
    }

    const url =
      `https://api.openweathermap.org/data/2.5/weather` +
      `?lat=${lat}&lon=${lon}&units=metric` +
      `&appid=${OPENWEATHER_API_KEY.value()}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new HttpsError("internal", `Weather upstream: ${res.status}`);
    }
    const j = (await res.json()) as {
      wind?: { speed?: number; deg?: number; gust?: number };
      main?: { temp?: number; pressure?: number };
      weather?: Array<{ main?: string }>;
    };
    return {
      windMps: j.wind?.speed ?? 0,
      windDeg: j.wind?.deg ?? 0,
      gustMps: j.wind?.gust ?? 0,
      airTempC: j.main?.temp ?? 0,
      pressureHpa: j.main?.pressure ?? 0,
      conditions: j.weather?.[0]?.main ?? "Unknown",
    };
  },
);
