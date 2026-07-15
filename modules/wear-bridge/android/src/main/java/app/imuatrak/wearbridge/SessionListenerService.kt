package app.imuatrak.wearbridge

import android.net.Uri
import android.util.Log
import com.google.android.gms.wearable.ChannelClient
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import java.io.File

/**
 * Receives session files from the Wear OS app.
 *
 * The watch opens one channel per file at
 *   /imuatrak/session/{id}/session  and  /imuatrak/session/{id}/track
 * Files are written to {filesDir}/sessions/{id}/{key}.json — the exact
 * layout expo-file-system's storage.load() reads (documentDirectory maps
 * to filesDir on Android), mirroring the iOS WatchConnectivity receiver.
 */
class SessionListenerService : WearableListenerService() {

    override fun onChannelOpened(channel: ChannelClient.Channel) {
        val parsed = parse(channel.path) ?: return
        val (id, key) = parsed
        val dir = File(filesDir, "sessions/$id").apply { mkdirs() }
        val dest = File(dir, "$key.json")
        Wearable.getChannelClient(this)
            .receiveFile(channel, Uri.fromFile(dest), false)
            .addOnFailureListener { e -> Log.e(TAG, "receiveFile failed for ${channel.path}: $e") }
    }

    override fun onInputClosed(channel: ChannelClient.Channel, closeReason: Int, appError: Int) {
        val parsed = parse(channel.path) ?: return
        val (id, _) = parsed
        if (closeReason != ChannelClient.ChannelCallback.CLOSE_REASON_NORMAL &&
            closeReason != ChannelClient.ChannelCallback.CLOSE_REASON_REMOTE_CLOSE) {
            Log.w(TAG, "Channel ${channel.path} closed abnormally (reason=$closeReason)")
            return
        }
        val dir = File(filesDir, "sessions/$id")
        val complete = File(dir, "session.json").exists() && File(dir, "track.json").exists()
        if (complete) {
            // Idempotent on the JS side — re-emitting for the second file is harmless.
            WearBridgeModule.emitSessionReceived(id)
        }
    }

    private fun parse(path: String): Pair<String, String>? {
        // "/imuatrak/session/{id}/{key}"
        val parts = path.split("/")
        if (parts.size != 5 || parts[1] != "imuatrak" || parts[2] != "session") return null
        val id = parts[3]
        val key = parts[4]
        if (key != "session" && key != "track") return null
        if (id.isEmpty() || id.contains("..")) return null
        return id to key
    }

    private companion object {
        const val TAG = "WearBridge"
    }
}
