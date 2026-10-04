plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.pulsofitness.wear"
    compileSdk = 36

    defaultConfig {
        minSdk = 30 // Wear OS 3+
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        val dsn = (project.findProperty("pulsoSentryDsn") as String?).orEmpty()
        buildConfigField("String", "SENTRY_DSN", "\"$dsn\"")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // The Wear OS Data Layer only connects apps with the SAME application ID and
    // signing key as the phone app, so each flavor mirrors a phone variant.
    flavorDimensions += "variant"
    productFlavors {
        create("dev") {
            dimension = "variant"
            applicationId = "com.lalomaster.pulso"
        }
        create("prod") {
            dimension = "variant"
            applicationId = "com.pulsofitness.pulsofitness"
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.06.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.wear.compose:compose-material:1.4.1")
    implementation("androidx.wear.compose:compose-foundation:1.4.1")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.1")
    implementation("com.google.android.gms:play-services-wearable:19.0.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.10.2")
    implementation("io.sentry:sentry-android:8.13.2")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
