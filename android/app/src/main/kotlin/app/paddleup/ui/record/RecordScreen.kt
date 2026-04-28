package app.paddleup.ui.record

import android.Manifest
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.paddleup.services.RecordingForegroundService
import kotlinx.coroutines.launch

@Composable
fun RecordScreen(
    onFinish: (String?) -> Unit,
    vm: RecordViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val live by vm.live.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    val permissions = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) { granted ->
        if (granted.values.all { it }) {
            vm.start()
            context.startForegroundService(Intent(context, RecordingForegroundService::class.java))
        }
    }

    LaunchedEffect(Unit) {
        if (!live.isRecording) {
            permissions.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.POST_NOTIFICATIONS,
                ),
            )
        }
    }

    Scaffold { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).padding(24.dp),
            verticalArrangement = Arrangement.SpaceBetween,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                if (live.isRecording) "Recording" else "Ready",
                style = MaterialTheme.typography.headlineSmall,
            )

            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                MetricRow(
                    "Distance",
                    "%.2f km".format(live.distanceMeters / 1000.0),
                )
                MetricRow(
                    "Time",
                    formatDuration(live.durationSec),
                )
                MetricRow(
                    "Pace",
                    if (live.currentSpeedMps > 0)
                        formatPace(1000.0 / live.currentSpeedMps) else "—",
                )
                MetricRow(
                    "Stroke rate",
                    if (live.currentStrokeRate > 0) "${live.currentStrokeRate.toInt()} spm" else "—",
                )
                MetricRow(
                    "Strokes",
                    live.strokeCount.toString(),
                )
            }

            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedButton(
                    onClick = { vm.discard(); onFinish(null) },
                    modifier = Modifier.weight(1f),
                ) { Text("Discard") }

                Button(
                    onClick = {
                        scope.launch {
                            val id = vm.stopAndSave()
                            onFinish(id)
                        }
                    },
                    modifier = Modifier.weight(1f),
                ) { Text("Stop & save") }
            }
        }
    }
}

@Composable
private fun MetricRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyLarge)
        Text(value, style = MaterialTheme.typography.headlineSmall)
    }
    Spacer(Modifier.height(4.dp))
}

private fun formatDuration(sec: Double): String {
    val s = sec.toInt()
    return "%02d:%02d:%02d".format(s / 3600, (s % 3600) / 60, s % 60)
}

private fun formatPace(secPerKm: Double): String {
    val s = secPerKm.toInt()
    return "%d:%02d /km".format(s / 60, s % 60)
}
