package app.imuatrak.wearbridge

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * JS-facing module. Mirrors the iOS WatchBridgeModule event API:
 * emits "sessionReceived" { id } when a full session (session.json +
 * track.json) has arrived from the watch.
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

    private fun emit(sessionId: String) {
        val ctx = reactApplicationContext
        if (!ctx.hasActiveReactInstance()) return
        val payload = Arguments.createMap().apply { putString("id", sessionId) }
        ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("sessionReceived", payload)
    }

    companion object {
        @Volatile
        private var instance: WearBridgeModule? = null

        /** Called by SessionListenerService once both files are on disk. */
        fun emitSessionReceived(sessionId: String) {
            instance?.emit(sessionId)
        }
    }
}
