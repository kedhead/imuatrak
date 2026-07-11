package app.imuatrak.wear

import android.Manifest
import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import androidx.wear.compose.material.*
import app.imuatrak.wear.models.WatchSession
import app.imuatrak.wear.services.ExerciseService
import app.imuatrak.wear.services.TransferManager
import app.imuatrak.wear.services.WorkoutManager
import kotlinx.coroutines.launch

private val CRAFTS = listOf("OC1", "OC2", "OC6", "V1", "SUP", "SURFSKI", "DB10", "DB20")

private val BrandBlue = Color(0xFF3B82F6)
private val Amber = Color(0xFFF59E0B)
private val Red = Color(0xFFEF4444)
private val Green = Color(0xFF22C55E)
private val Muted = Color(0xFF9AA5B1)

private enum class Screen { Start, Recording, Summary }

class MainActivity : ComponentActivity() {

    private val workout: WorkoutManager get() = (application as ImuaTrakApp).workoutManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Best-effort: push any sessions recorded out of phone range.
        lifecycleScope.launch {
            try { TransferManager.retryPending(applicationContext) } catch (_: Exception) {}
        }

        setContent {
            MaterialTheme {
                WearApp(workout)
            }
        }
    }
}

@Composable
private fun WearApp(workout: WorkoutManager) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val isRecording by workout.isRecording.collectAsStateWithLifecycle()
    var screen by remember { mutableStateOf(if (workout.isRecording.value) Screen.Recording else Screen.Start) }
    var summary by remember { mutableStateOf<WatchSession?>(null) }
    val scope = rememberCoroutineScope()

    // If the activity was re-created mid-workout, land on the recording screen.
    LaunchedEffect(isRecording) {
        if (isRecording && screen == Screen.Start) screen = Screen.Recording
    }

    Scaffold(timeText = { TimeText() }) {
        when (screen) {
            Screen.Start -> StartScreen(
                onStart = { craft ->
                    workout.currentCraft = craft
                    ExerciseService.start(context)
                    workout.start()
                    screen = Screen.Recording
                },
            )
            Screen.Recording -> RecordingScreen(
                workout = workout,
                onStop = {
                    scope.launch {
                        val session = workout.stopAndSave()
                        ExerciseService.stop(context)
                        summary = session
                        screen = Screen.Summary
                    }
                },
            )
            Screen.Summary -> SummaryScreen(
                session = summary,
                imperial = context.isImperial(),
                onDone = {
                    summary = null
                    screen = Screen.Start
                },
            )
        }
    }
}

// ── Start ─────────────────────────────────────────────────────────────────────

@Composable
private fun StartScreen(onStart: (craft: String) -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    var craftIndex by remember { mutableStateOf(context.savedCraftIndex()) }
    var imperial by remember { mutableStateOf(context.isImperial()) }
    var pendingStart by remember { mutableStateOf(false) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        if (pendingStart && grants[Manifest.permission.ACCESS_FINE_LOCATION] == true) {
            onStart(CRAFTS[craftIndex])
        }
        pendingStart = false
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("ImuaTrak", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = BrandBlue)
        Spacer(Modifier.height(10.dp))

        // Craft selector — tap to cycle
        Chip(
            onClick = {
                craftIndex = (craftIndex + 1) % CRAFTS.size
                context.saveCraftIndex(craftIndex)
            },
            label = {
                Text(CRAFTS[craftIndex], modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
            },
            colors = ChipDefaults.secondaryChipColors(),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(6.dp))

        // Units toggle
        Chip(
            onClick = {
                imperial = !imperial
                context.setImperial(imperial)
            },
            label = {
                Text(
                    if (imperial) "Miles" else "Kilometers",
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center,
                    fontSize = 12.sp,
                )
            },
            colors = ChipDefaults.secondaryChipColors(),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))

        Button(
            onClick = {
                pendingStart = true
                permissionLauncher.launch(requiredPermissions())
            },
            colors = ButtonDefaults.primaryButtonColors(backgroundColor = Green),
            modifier = Modifier.size(56.dp),
        ) {
            Text("GO", fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(8.dp))
    }
}

private fun requiredPermissions(): Array<String> {
    val perms = mutableListOf(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.BODY_SENSORS,
    )
    if (android.os.Build.VERSION.SDK_INT >= 33) {
        perms.add(Manifest.permission.POST_NOTIFICATIONS)
    }
    return perms.toTypedArray()
}

// ── Recording ─────────────────────────────────────────────────────────────────

@Composable
private fun RecordingScreen(workout: WorkoutManager, onStop: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val imperial = remember { context.isImperial() }
    val durationSec by workout.durationSec.collectAsStateWithLifecycle()
    val distanceM by workout.distanceM.collectAsStateWithLifecycle()
    val strokeRate by workout.strokeRate.collectAsStateWithLifecycle()
    val heartRate by workout.heartRate.collectAsStateWithLifecycle()
    val isPaused by workout.isPaused.collectAsStateWithLifecycle()
    var stopping by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            formatDuration(durationSec),
            fontSize = 30.sp,
            fontWeight = FontWeight.Bold,
            color = if (isPaused) Amber else Color.White,
        )
        Spacer(Modifier.height(2.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Metric(formatDistance(distanceM, imperial), if (imperial) "mi" else "km")
            Metric(formatPace(distanceM, durationSec, imperial), if (imperial) "/mi" else "/km")
        }
        Spacer(Modifier.height(2.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Metric(if (strokeRate > 0) "${strokeRate.toInt()}" else "--", "spm")
            Metric(if (heartRate > 0) "$heartRate" else "--", "bpm", color = Red)
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(
                onClick = { if (isPaused) workout.resume() else workout.pause() },
                colors = ButtonDefaults.secondaryButtonColors(),
                modifier = Modifier.size(44.dp),
                enabled = !stopping,
            ) {
                Text(if (isPaused) "▶" else "❙❙", fontSize = 14.sp)
            }
            Button(
                onClick = {
                    if (!stopping) {
                        stopping = true
                        onStop()
                    }
                },
                colors = ButtonDefaults.primaryButtonColors(backgroundColor = Red),
                modifier = Modifier.size(44.dp),
                enabled = !stopping,
            ) {
                Text("■", fontSize = 14.sp)
            }
        }
    }
}

@Composable
private fun Metric(value: String, unit: String, color: Color = Color.White) {
    Row(verticalAlignment = Alignment.Bottom) {
        Text(value, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = color)
        Spacer(Modifier.width(3.dp))
        Text(unit, fontSize = 11.sp, color = Muted)
    }
}

// ── Summary ───────────────────────────────────────────────────────────────────

@Composable
private fun SummaryScreen(session: WatchSession?, imperial: Boolean, onDone: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Nice paddle! 🌊", fontSize = 14.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        if (session != null) {
            val t = session.totals
            SummaryRow("Distance", "${formatDistance(t.distanceMeters, imperial)} ${if (imperial) "mi" else "km"}")
            SummaryRow("Time", formatDuration(t.durationSec.toLong()))
            SummaryRow("Strokes", "${t.strokeCount}")
            if (session.hr.avg > 0) SummaryRow("Avg HR", "${session.hr.avg} bpm")
            Spacer(Modifier.height(6.dp))
            Text(
                "Synced to your phone when it's in range.",
                fontSize = 10.sp, color = Muted, textAlign = TextAlign.Center,
            )
        }
        Spacer(Modifier.height(10.dp))
        Button(onClick = onDone, colors = ButtonDefaults.primaryButtonColors(backgroundColor = BrandBlue)) {
            Text("Done", fontSize = 12.sp)
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun SummaryRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 1.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, fontSize = 12.sp, color = Muted)
        Text(value, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

// ── Formatting + prefs ────────────────────────────────────────────────────────

private fun formatDuration(sec: Long): String {
    val h = sec / 3600; val m = (sec % 3600) / 60; val s = sec % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}

private fun formatDistance(meters: Double, imperial: Boolean): String {
    val v = if (imperial) meters / 1609.344 else meters / 1000.0
    return "%.2f".format(v)
}

private fun formatPace(meters: Double, sec: Long, imperial: Boolean): String {
    if (meters < 10) return "--:--"
    val unitM = if (imperial) 1609.344 else 1000.0
    val secPerUnit = sec / (meters / unitM)
    if (secPerUnit <= 0 || secPerUnit > 5999) return "--:--"
    return "%d:%02d".format((secPerUnit / 60).toInt(), (secPerUnit % 60).toInt())
}

private fun Context.prefs() = getSharedPreferences("settings", Context.MODE_PRIVATE)
private fun Context.isImperial() = prefs().getBoolean("imperial", false)
private fun Context.setImperial(v: Boolean) = prefs().edit().putBoolean("imperial", v).apply()
private fun Context.savedCraftIndex() = prefs().getInt("craft", 0).coerceIn(0, CRAFTS.size - 1)
private fun Context.saveCraftIndex(i: Int) = prefs().edit().putInt("craft", i).apply()
