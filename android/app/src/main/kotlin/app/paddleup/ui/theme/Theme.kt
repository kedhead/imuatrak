package app.paddleup.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val PaddleupBlue = Color(0xFF0E5FA5)
private val PaddleupTeal = Color(0xFF1FB6A6)
private val PaddleupSand = Color(0xFFF4ECD8)
private val PaddleupInk  = Color(0xFF0B1E2D)

private val Light = lightColorScheme(
    primary = PaddleupBlue,
    secondary = PaddleupTeal,
    background = PaddleupSand,
    onPrimary = Color.White,
    onBackground = PaddleupInk,
)

private val Dark = darkColorScheme(
    primary = PaddleupTeal,
    secondary = PaddleupBlue,
    background = PaddleupInk,
    onPrimary = PaddleupInk,
    onBackground = PaddleupSand,
)

@Composable
fun PaddleupTheme(content: @Composable () -> Unit) {
    val scheme = if (isSystemInDarkTheme()) Dark else Light
    MaterialTheme(colorScheme = scheme, content = content)
}
