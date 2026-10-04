// Same toolchain as the phone app (React Native 0.85: AGP 8.12, Kotlin 2.1.20).
plugins {
    id("com.android.application") version "8.12.0" apply false
    id("org.jetbrains.kotlin.android") version "2.1.20" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.20" apply false
}
