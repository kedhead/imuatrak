package app.imuatrak.wear.services

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService

/**
 * Receives the units preference pushed from the phone app.
 *
 * The phone writes a DataItem at /imuatrak/settings whenever units change (and
 * once on launch) — see modules/wear-bridge WearBridgeModule.setUnits. We mirror
 * it into the same SharedPreferences the UI already reads, so the watch picks
 * the change up whether or not it was running at the time: the Data Layer
 * starts this service on delivery, and replays the item when the watch comes
 * back into range.
 *
 * The watch keeps its own units toggle. Whoever wrote last wins — a phone
 * change overwrites the watch's local choice, and vice versa.
 */
class SettingsListenerService : WearableListenerService() {

    override fun onDataChanged(events: DataEventBuffer) {
        for (event in events) {
            if (event.type != DataEvent.TYPE_CHANGED) continue
            if (event.dataItem.uri.path != SETTINGS_PATH) continue

            val units = DataMapItem.fromDataItem(event.dataItem).dataMap.getString(KEY_UNITS)
            if (units == null) {
                Log.w(TAG, "settings DataItem carried no units value")
                continue
            }

            applicationContext
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_IMPERIAL, units == "imperial")
                .apply()
        }
    }

    companion object {
        private const val TAG = "SettingsListener"

        /** Must match WearBridgeModule on the phone side. */
        private const val SETTINGS_PATH = "/imuatrak/settings"
        private const val KEY_UNITS = "units"

        /** Shared with MainActivity — the UI reads units from here. */
        const val PREFS_NAME = "settings"
        const val KEY_IMPERIAL = "imperial"
    }
}
