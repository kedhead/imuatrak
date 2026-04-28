package app.paddleup.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.paddleup.data.db.SessionDao
import app.paddleup.data.db.SessionEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn

@HiltViewModel
class HomeViewModel @Inject constructor(
    dao: SessionDao,
) : ViewModel() {
    val sessions: StateFlow<List<SessionEntity>> = dao.observeAll()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
}
