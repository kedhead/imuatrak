package app.paddleup.di

import android.content.Context
import app.paddleup.data.db.PaddleupDatabase
import app.paddleup.data.db.SessionDao
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.ktx.auth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ktx.firestore
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.ktx.functions
import com.google.firebase.ktx.Firebase
import com.google.firebase.storage.FirebaseStorage
import com.google.firebase.storage.ktx.storage
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        prettyPrint = false
    }

    @Provides @Singleton
    fun provideDatabase(@ApplicationContext context: Context): PaddleupDatabase =
        PaddleupDatabase.build(context)

    @Provides
    fun provideSessionDao(db: PaddleupDatabase): SessionDao = db.sessionDao()

    @Provides @Singleton fun provideAuth(): FirebaseAuth = Firebase.auth
    @Provides @Singleton fun provideFirestore(): FirebaseFirestore = Firebase.firestore
    @Provides @Singleton fun provideStorage(): FirebaseStorage = Firebase.storage
    @Provides @Singleton fun provideFunctions(): FirebaseFunctions = Firebase.functions
}
