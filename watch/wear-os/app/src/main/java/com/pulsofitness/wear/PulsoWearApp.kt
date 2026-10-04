package com.pulsofitness.wear

import android.app.Application
import io.sentry.android.core.SentryAndroid

/** Crash reporting for the watch, only when a DSN is configured (see gradle.properties). */
class PulsoWearApp : Application() {
    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.SENTRY_DSN.isNotBlank()) {
            runCatching {
                SentryAndroid.init(this) { options ->
                    options.dsn = BuildConfig.SENTRY_DSN
                    options.environment = BuildConfig.FLAVOR
                    options.isSendDefaultPii = false
                    options.isAttachScreenshot = false
                    options.isAttachViewHierarchy = false
                    // No user, no breadcrumbs with values: the watch shows weights and reps.
                    options.setBeforeSend { event, _ -> event.apply { user = null; breadcrumbs = null } }
                }
            }
        }
    }
}
