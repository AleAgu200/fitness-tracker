package expo.modules.pulsowidget

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

class PulsoWidgetModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is unavailable" }

  override fun definition() = ModuleDefinition {
    Name("PulsoWidget")

    Events(REST_CHANGED_EVENT)

    OnCreate { live = WeakReference(this@PulsoWidgetModule) }
    OnDestroy { live = null }

    Function("setWorkout") { workoutActive: Boolean,
                             currentExercise: String?,
                             nextExercise: String?,
                             setDetail: String?,
                             accent: String? ->
      PulsoWidgetStore.writeWorkout(context, workoutActive, currentExercise, nextExercise, setDetail, accent)
      PulsoWidgetProvider.renderAll(context)
    }

    /** [restEndAt] is wall-clock ms; pass null to clear the timer. */
    Function("setRest") { restEndAt: Double?, restTotal: Int ->
      val endAt = restEndAt?.toLong() ?: 0L
      PulsoWidgetStore.writeRest(context, endAt, restTotal)
      PulsoWidgetProvider.scheduleElapsedAlarm(context, endAt)
      PulsoWidgetProvider.renderAll(context)
    }

    /** Source of truth the app reconciles against when it returns to the foreground. */
    Function("getRest") {
      val snapshot = PulsoWidgetStore.read(context)
      mapOf(
        "restEndAt" to if (snapshot.restEndAt > 0L) snapshot.restEndAt.toDouble() else null,
        "restTotal" to snapshot.restTotal,
      )
    }
  }

  companion object {
    private const val REST_CHANGED_EVENT = "onRestChanged"

    /**
     * Set while a module instance exists so the widget provider — which runs in a broadcast
     * receiver, often with no RN context at all — can tell a live app that a widget button
     * moved the timer. A weak ref keeps a torn-down instance from leaking.
     */
    private var live: WeakReference<PulsoWidgetModule>? = null

    fun notifyRestChanged(context: Context) {
      val module = live?.get() ?: return
      val snapshot = PulsoWidgetStore.read(context)
      runCatching {
        module.sendEvent(
          REST_CHANGED_EVENT,
          mapOf(
            "restEndAt" to if (snapshot.restEndAt > 0L) snapshot.restEndAt.toDouble() else null,
            "restTotal" to snapshot.restTotal,
          ),
        )
      }
    }
  }
}
