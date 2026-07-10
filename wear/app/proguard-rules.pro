# kotlinx.serialization — keep generated serializers for the session models
# transferred to the phone (R8 must not strip or rename their fields, or the
# JSON schema stops matching src/models/index.ts).
-keepclassmembers class app.imuatrak.wear.models.** {
    *** Companion;
}
-keepclasseswithmembers class app.imuatrak.wear.models.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class app.imuatrak.wear.models.**$$serializer { *; }

# Health Services AIDL-backed client classes
-keep class androidx.health.services.client.** { *; }
