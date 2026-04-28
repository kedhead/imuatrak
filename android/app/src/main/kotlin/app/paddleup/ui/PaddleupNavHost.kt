package app.paddleup.ui

import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import app.paddleup.ui.detail.SessionDetailScreen
import app.paddleup.ui.home.HomeScreen
import app.paddleup.ui.record.RecordScreen
import app.paddleup.ui.settings.SettingsScreen

object Routes {
    const val HOME = "home"
    const val RECORD = "record"
    const val DETAIL = "detail/{sessionId}"
    const val SETTINGS = "settings"

    fun detail(id: String) = "detail/$id"
}

@Composable
fun PaddleupNavHost() {
    val nav = rememberNavController()
    NavHost(navController = nav, startDestination = Routes.HOME) {
        composable(Routes.HOME) {
            HomeScreen(
                onStartRecord = { nav.navigate(Routes.RECORD) },
                onOpenSession = { id -> nav.navigate(Routes.detail(id)) },
                onOpenSettings = { nav.navigate(Routes.SETTINGS) },
            )
        }
        composable(Routes.RECORD) {
            RecordScreen(onFinish = { id ->
                nav.popBackStack()
                if (id != null) nav.navigate(Routes.detail(id))
            })
        }
        composable(
            Routes.DETAIL,
            arguments = listOf(navArgument("sessionId") { type = NavType.StringType }),
        ) { backStack ->
            val id = backStack.arguments?.getString("sessionId").orEmpty()
            SessionDetailScreen(sessionId = id, onBack = { nav.popBackStack() })
        }
        composable(Routes.SETTINGS) {
            SettingsScreen(onBack = { nav.popBackStack() })
        }
    }
}
