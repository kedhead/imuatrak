package app.paddleup.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface SessionDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertSession(session: SessionEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTrackPoints(points: List<TrackPointEntity>)

    @Update
    suspend fun updateSession(session: SessionEntity)

    @Query("SELECT * FROM sessions ORDER BY startedAtEpochMs DESC")
    fun observeAll(): Flow<List<SessionEntity>>

    @Query("SELECT * FROM sessions WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): SessionEntity?

    @Query("SELECT * FROM track_points WHERE sessionId = :sessionId ORDER BY tSec ASC")
    suspend fun getTrack(sessionId: String): List<TrackPointEntity>

    @Query("SELECT * FROM sessions WHERE synced = 0")
    suspend fun unsynced(): List<SessionEntity>

    @Query("UPDATE sessions SET synced = 1, trackStoragePath = :trackPath WHERE id = :id")
    suspend fun markSynced(id: String, trackPath: String)

    @Query("DELETE FROM sessions WHERE id = :id")
    suspend fun delete(id: String)
}
