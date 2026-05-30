package app.imuatrak.wear.services

import app.imuatrak.wear.models.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.*
import java.net.HttpURLConnection
import java.net.URL

object WeatherService {
    // Fill in your Firebase project ID — same as EXPO_PUBLIC_FIREBASE_PROJECT_ID
    private const val PROJECT_ID = "YOUR_FIREBASE_PROJECT_ID"
    private const val REGION = "us-central1"

    suspend fun fetch(lat: Double, lon: Double): WatchWeatherSummary? =
        withTimeoutOrNull(5_000L) {
            withContext(Dispatchers.IO) {
                try {
                    val url = URL("https://$REGION-$PROJECT_ID.cloudfunctions.net/fetchWeather")
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "POST"
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.doOutput = true
                    conn.outputStream.write("""{"data":{"lat":$lat,"lon":$lon}}""".toByteArray())

                    val resp = Json.parseToJsonElement(conn.inputStream.bufferedReader().readText())
                    val result = resp.jsonObject["result"]?.jsonObject ?: return@withContext null

                    fun d(key: String) = result[key]?.jsonPrimitive?.double ?: 0.0
                    val sample = WatchWeatherSample(0.0, d("windMps"), d("windDeg"),
                        d("gustMps"), d("airTempC"), d("pressureHpa"),
                        result["conditions"]?.jsonPrimitive?.contentOrNull)
                    WatchWeatherSummary(sample, listOf(sample))
                } catch (_: Exception) { null }
            }
        }
}
