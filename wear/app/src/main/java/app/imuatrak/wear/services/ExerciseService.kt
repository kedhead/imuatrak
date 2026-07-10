package app.imuatrak.wear.services

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.lifecycle.LifecycleService
import androidx.wear.ongoing.OngoingActivity
import app.imuatrak.wear.ImuaTrakApp
import app.imuatrak.wear.MainActivity
import app.imuatrak.wear.R

/**
 * Foreground service that keeps the process (and therefore the accelerometer
 * stroke detector + Health Services callbacks) alive while a session is
 * recording with the screen off. All workout logic lives in WorkoutManager;
 * this class only manages the service lifecycle and the ongoing notification.
 */
class ExerciseService : LifecycleService() {

    companion object {
        private const val CHANNEL_ID = "workout"
        private const val NOTIFICATION_ID = 1

        const val ACTION_START = "app.imuatrak.wear.START"
        const val ACTION_STOP = "app.imuatrak.wear.STOP"

        fun start(context: Context) {
            context.startForegroundService(
                Intent(context, ExerciseService::class.java).setAction(ACTION_START)
            )
        }

        fun stop(context: Context) {
            context.startService(
                Intent(context, ExerciseService::class.java).setAction(ACTION_STOP)
            )
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        when (intent?.action) {
            ACTION_STOP -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
            else -> goForeground()
        }
        return START_STICKY
    }

    private fun goForeground() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Workout", NotificationManager.IMPORTANCE_LOW)
        )

        val touchIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).setFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            ),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("ImuaTrak is recording")
            .setContentText("Tracking your paddle")
            .setContentIntent(touchIntent)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)

        OngoingActivity.Builder(applicationContext, NOTIFICATION_ID, builder)
            .setStaticIcon(R.drawable.ic_notification)
            .setTouchIntent(touchIntent)
            .build()
            .apply(applicationContext)

        val type = if (Build.VERSION.SDK_INT >= 34) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        } else {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        }
        ServiceCompat.startForeground(this, NOTIFICATION_ID, builder.build(), type)
    }

    override fun onDestroy() {
        // Safety net: if the OS kills the service, don't leave a zombie workout.
        val app = application as ImuaTrakApp
        if (!app.workoutManager.isRecording.value) {
            // Normal shutdown after stop — nothing to do.
        }
        super.onDestroy()
    }
}
