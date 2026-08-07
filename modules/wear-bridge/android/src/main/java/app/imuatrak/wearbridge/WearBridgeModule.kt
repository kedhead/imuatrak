package app.imuatrak.wearbridge

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable

/**
 * JS-facing module. Mirrors the iOS WatchBridgeModule API:
 * emits "sessionReceived" { id } when a full session (session.json +
 * track.json) has arrived from the watch, and pushes the units preference
 * down to the watch.
 *
 * SessionListenerService receives files even when React isn't running;
 * in that case no event fires and the Home tab picks the session up from
 * disk on next launch.
 */
class WearBridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "WearBridgeModule"

    override fun initialize() {
        super.initialize()
        instance = this
    }

    override fun invalidate() {
        if (instance === this) instance = null
        super.invalidate()
    }

    // Required no-ops so NativeEventEmitter doesn't warn.
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    /**
     * Publish the units preference for the watch to pick up.
     *
     * A DataItem (not a message) so the value survives the watch being out of
     * range — the Data Layer replays it on reconnect. `updatedAt` is included
     * deliberately: the watch has its own units toggle, so a phone write that
     * repeats the last phone value must still produce a changed DataItem to
     * pull a diverged watch back in line.
     */
    @ReactMethod
    fun setUnits(units: String) {
        val request = PutDataMapRequest.create(SETTINGS_PATH).apply {
            dataMap.putString(KEY_UNITS, units)
            dataMap.putLong(KEY_UPDATED_AT, System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()

        Wearable.getDataClient(reactApplicationContext)
            .putDataItem(request)
            .addOnFailureListener { e ->
                // Non-critical: the watch keeps its current units. Most common
                // cause is simply no paired watch.
                Log.w(TAG, "setUnits putDataItem failed: $e")
            }
    }

    private fun emit(sessionId: String) {
        val ctx = reactApplicationContext
        if (!ctx.hasActiveReactInstance()) return
        val payload = Arguments.createMap().apply { putString("id", sessionId) }
        ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("sessionReceived", payload)
    }

    companion object {
        private const val TAG = "WearBridge"

        /** Must match SettingsListenerService on the watch side. */
        private const val SETTINGS_PATH = "/imuatrak/settings"
        private const val KEY_UNITS = "units"
        private const val KEY_UPDATED_AT = "updatedAt"

        @Volatile
        private var instance: WearBridgeModule? = null

        /** Called by SessionListenerService once both files are on disk. */
        fun emitSessionReceived(sessionId: String) {
            instance?.emit(sessionId)
        }
    }
}
