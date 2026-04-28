package app.paddleup.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [SessionEntity::class, TrackPointEntity::class],
    version = 1,
    exportSchema = false,
)
abstract class PaddleupDatabase : RoomDatabase() {
    abstract fun sessionDao(): SessionDao

    companion object {
        fun build(context: Context): PaddleupDatabase =
            Room.databaseBuilder(context, PaddleupDatabase::class.java, "paddleup.db")
                .build()
    }
}
