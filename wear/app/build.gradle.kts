import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
}

// Optional release signing. Create wear/keystore.properties (gitignored) with
// storeFile/storePassword/keyAlias/keyPassword pointing at the SAME keystore
// EAS uses for the phone app (`eas credentials -p android` → download), or the
// Data Layer will refuse to sync watch→phone (signatures must match).
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "app.imuatrak.wear"
    compileSdk = 35
    defaultConfig {
        // MUST match the phone app's applicationId — the Wearable Data Layer
        // only exchanges data between watch/phone apps that share the same
        // application ID and signing certificate.
        applicationId = "app.imuatrak"
        minSdk = 30       // Wear OS 3+
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        // Firebase project id for the fetchWeather Cloud Function — same value
        // as EXPO_PUBLIC_FIREBASE_PROJECT_ID in the phone app's env. Blank
        // (unset at build time) simply disables the weather fetch.
        buildConfigField(
            "String",
            "FIREBASE_PROJECT_ID",
            "\"${System.getenv("EXPO_PUBLIC_FIREBASE_PROJECT_ID") ?: ""}\"",
        )
    }
    signingConfigs {
        if (keystoreProps.isNotEmpty()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            if (keystoreProps.isNotEmpty()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    composeOptions { kotlinCompilerExtensionVersion = "1.5.14" }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")

    // Compose for Wear OS
    implementation("androidx.wear.compose:compose-material:1.4.0")
    implementation("androidx.wear.compose:compose-foundation:1.4.0")
    implementation("androidx.wear.compose:compose-navigation:1.4.0")

    // Ongoing-activity notification (keeps the workout visible + process alive)
    implementation("androidx.wear:wear-ongoing:1.0.0")

    // Health Services (exercise tracking + GPS + HR)
    implementation("androidx.health:health-services-client:1.1.0-rc02")

    // Wearable Data Layer (phone transfer)
    implementation("com.google.android.gms:play-services-wearable:18.2.0")

    // Location (GPS)
    implementation("com.google.android.gms:play-services-location:21.3.0")

    // Serialization
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

    // Coroutines (+ adapters for Play Services Tasks and ListenableFuture)
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-guava:1.8.1")

    // Lifecycle
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-service:2.8.7")
}
