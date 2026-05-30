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

        try {
            val nodeClient = Wearable.getNodeClient(context)
            val nodes = nodeClient.connectedNodes.await()
            val channelClient = Wearable.getChannelClient(context)

            for (node in nodes) {
                sendFile(channelClient, node.id, id, "session", sessionFile)
                sendFile(channelClient, node.id, id, "track", trackFile)
            }
        } catch (e: Exception) {
            android.util.Log.e("TransferManager", "Transfer failed: $e")
            // Files are saved locally; sync will retry when phone reconnects
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
