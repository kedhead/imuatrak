package app.imuatrak.wear

import android.app.Application
import app.imuatrak.wear.services.WorkoutManager

/**
 * Holds the process-wide WorkoutManager. Both MainActivity (UI) and
 * ExerciseService (keeps the process alive during a workout) observe the
 * same instance, so state survives the activity being destroyed while the
 * screen is off.
 */
class ImuaTrakApp : Application() {
    val workoutManager: WorkoutManager by lazy { WorkoutManager(this) }
}
