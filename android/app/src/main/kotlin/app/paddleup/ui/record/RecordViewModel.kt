package app.paddleup.ui.record

import androidx.lifecycle.ViewModel
import app.paddleup.services.LiveStats
import app.paddleup.services.SessionRecorder
import app.paddleup.shared.model.CraftType
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.StateFlow

@HiltViewModel
class RecordViewModel @Inject constructor(
    private val recorder: SessionRecorder,
) : ViewModel() {

    val live: StateFlow<LiveStats> = recorder.live

    fun start(craft: CraftType = CraftType.OC1) = recorder.start(craft)
    suspend fun stopAndSave(): String? = recorder.stopAndSave()
    fun discard() = recorder.discard()
}
