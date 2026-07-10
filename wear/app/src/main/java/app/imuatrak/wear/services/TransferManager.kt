package app.imuatrak.wear.services

import android.content.Context
import com.google.android.gms.wearable.ChannelClient
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import app.imuatrak.wear.models.*
import java.io.File

object TransferManager {

    suspend fun transferSession(context: Context, session: WatchSession, track: List<WatchTrackPoint>) {
        val id = session.id
        val dir = File(context.filesDir, "sessions/$id").also { it.mkdirs() }
        val json = Json { encodeDefaults = true }

        val sessionFile = File(dir, "session.json")
        val trackFile = File(dir, "track.json")
        sessionFile.writeText(json.encodeToString(session))
        trackFile.writeText(json.encodeToString(track))

        sendDir(context, id, dir)
    }

    /**
     * Re-send any locally saved sessions that never reached the phone —
     * called on app launch so a paddle recorded out of Bluetooth range
     * lands on the phone the next time the app opens near it.
     */
    suspend fun retryPending(context: Context) {
        val root = File(context.filesDir, "sessions")
        val dirs = root.listFiles { f -> f.isDirectory } ?: return
        for (dir in dirs) {
            if (File(dir, ".sent").exists()) continue
            if (!File(dir, "session.json").exists()) continue
            sendDir(context, dir.name, dir)
        }
    }

    private suspend fun sendDir(context: Context, id: String, dir: File) {
        try {
            val nodeClient = Wearable.getNodeClient(context)
            val nodes = nodeClient.connectedNodes.await()
            if (nodes.isEmpty()) return // no phone in range; retryPending picks it up later
            val channelClient = Wearable.getChannelClient(context)

            for (node in nodes) {
                sendFile(channelClient, node.id, id, "session", File(dir, "session.json"))
                sendFile(channelClient, node.id, id, "track", File(dir, "track.json"))
            }
            File(dir, ".sent").writeText("1")
        } catch (e: Exception) {
            android.util.Log.e("TransferManager", "Transfer failed: $e")
            // Files are saved locally; retryPending() will retry on next launch
        }
    }

    private suspend fun sendFile(
        client: ChannelClient, nodeId: String, sessionId: String, fileKey: String, file: File,
    ) {
        val channel = client.openChannel(nodeId, "/imuatrak/session/$sessionId/$fileKey").await()
        client.sendFile(channel, android.net.Uri.fromFile(file)).await()
        client.close(channel).await()
    }
}
