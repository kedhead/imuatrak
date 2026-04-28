# Keep kotlinx-serialization @Serializable types
-keepattributes *Annotation*, InnerClasses, Signature
-dontnote kotlinx.serialization.AnnotationsKt

# Hilt
-keep class dagger.hilt.** { *; }
-keep class * extends dagger.hilt.android.HiltAndroidApp

# Room
-keep class androidx.room.** { *; }
-keep @androidx.room.* class * { *; }

# Firebase keeps its own rules; nothing extra needed.
