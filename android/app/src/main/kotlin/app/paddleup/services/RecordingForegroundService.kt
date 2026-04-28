package app.paddleup.services

import android.app.Notification
import android.app.PendingIntent
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import app.paddleup.MainActivity
import app.paddleup.PaddleupApp
import app.paddleup.R
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Keeps the recorder alive while the app is backgrounded. Started from
 * [SessionRecorder.start] via the UI layer; stops itself when recording ends.
 */
@AndroidEntryPoint
class RecordingForegroundService : LifecycleService() {

    @Inject lateinit var recorder: SessionRecorder

    override fun onBind(intent: Intent): IBinder? {
        super.onBind(intent)
        return null
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        startForeground(NOTIF_ID, buildNotification("Starting…", 0.0, 0))
        lifecycleScope.launch {
            recorder.live.collectLatest { live ->
                if (!live.isRecording) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                    return@collectLatest
                }
                val mins = (live.durationSec / 60).toInt()
                val secs = (live.durationSec % 60).toInt()
                val time = "%02d:%02d".format(mins, secs)
                val notif = buildNotification(
                    time = time,
                    distanceKm = live.distanceMeters / 1000.0,
                    spm = live.currentStrokeRate.toInt(),
                )
                getSystemService(android.app.NotificationManager::class.java)
                    .notify(NOTIF_ID, notif)
            }
        }
        return START_STICKY
    }

    private fun buildNotification(time: String, distanceKm: Double, spm: Int): Notification {
        val openApp = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val text = getString(R.string.recording_notification_text_template, time, distanceKm, spm)
        return NotificationCompat.Builder(this, PaddleupApp.CHANNEL_RECORDING)
            .setContentTitle(getString(R.string.recording_notification_title))
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openApp)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .build()
    }

    companion object {
        private const val NOTIF_ID = 0xCA10
    }
}
