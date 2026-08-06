package expo.modules.pulsowidget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews

const val ACTION_REST_ADD = "expo.modules.pulsowidget.REST_ADD"
const val ACTION_REST_REDUCE = "expo.modules.pulsowidget.REST_REDUCE"
const val ACTION_REST_SKIP = "expo.modules.pulsowidget.REST_SKIP"
const val ACTION_REST_ELAPSED = "expo.modules.pulsowidget.REST_ELAPSED"

private const val REST_STEP_MS = 30_000L

class PulsoWidgetLargeProvider : PulsoWidgetProvider(PulsoWidgetVariant.LARGE)

class PulsoWidgetSmallProvider : PulsoWidgetProvider(PulsoWidgetVariant.SMALL)

/**
 * Per-size layout differences. Both strips are too short for the full stack, so each one
 * declares which views its layout actually contains — a RemoteViews call against a view
 * that is not in the inflated layout throws at apply time.
 */
enum class PulsoWidgetVariant(
  val layout: Int,
  /** Null when the layout has no eyebrow row (the 1x1 has no vertical room for one). */
  val eyebrow: String?,
  /** The 4x1 folds the set line into the title; the 1x1 has no room for it at all. */
  val showsDetail: Boolean,
  val hasControls: Boolean,
  val provider: Class<out AppWidgetProvider>,
) {
  LARGE(R.layout.pulso_widget_large, "ENTRENO ACTUAL", true, true, PulsoWidgetLargeProvider::class.java),
  SMALL(R.layout.pulso_widget_small, null, false, false, PulsoWidgetSmallProvider::class.java),
}

/**
 * Renders the workout widgets and owns the rest timer while the RN process is dead.
 *
 * The countdown is never redrawn per second — [RemoteViews.setChronometerCountDown] hands
 * the deadline to the platform, which ticks the view inside the launcher's process. The
 * provider only repaints when the underlying state actually changes.
 */
abstract class PulsoWidgetProvider(private val variant: PulsoWidgetVariant) : AppWidgetProvider() {

  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val views = buildViews(context, PulsoWidgetStore.read(context), variant)
    ids.forEach { manager.updateAppWidget(it, views) }
  }

  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      ACTION_REST_ADD -> mutateRest(context, PulsoWidgetStore.shiftRest(context, REST_STEP_MS))
      ACTION_REST_REDUCE -> mutateRest(context, PulsoWidgetStore.shiftRest(context, -REST_STEP_MS))
      ACTION_REST_SKIP -> {
        PulsoWidgetStore.clearRest(context)
        mutateRest(context, 0L)
      }
      // The single alarm we schedule, fired at zero so the card flips to its idle state
      // instead of letting the Chronometer run on into negative time.
      ACTION_REST_ELAPSED -> {
        if (PulsoWidgetStore.read(context).restEndAt <= System.currentTimeMillis()) {
          PulsoWidgetStore.clearRest(context)
        }
        renderAll(context)
      }
      else -> super.onReceive(context, intent)
    }
  }

  private fun mutateRest(context: Context, restEndAt: Long) {
    scheduleElapsedAlarm(context, restEndAt)
    renderAll(context)
    // Best effort: only lands if the RN process happens to be alive. The app otherwise
    // reconciles from the same store when it next returns to the foreground.
    PulsoWidgetModule.notifyRestChanged(context)
  }

  companion object {
    private const val TITLE_COLOR = 0xFFFAFAFA.toInt()

    private fun pendingIntentFlags(): Int =
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

    /** Repaints every placed widget of both sizes from the current stored snapshot. */
    fun renderAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val snapshot = PulsoWidgetStore.read(context)
      PulsoWidgetVariant.entries.forEach { variant ->
        val ids = manager.getAppWidgetIds(ComponentName(context, variant.provider))
        if (ids.isEmpty()) return@forEach
        val views = buildViews(context, snapshot, variant)
        ids.forEach { manager.updateAppWidget(it, views) }
      }
    }

    private fun buildViews(
      context: Context,
      snapshot: WidgetSnapshot,
      variant: PulsoWidgetVariant,
    ): RemoteViews {
      val views = RemoteViews(context.packageName, variant.layout)
      views.setOnClickPendingIntent(R.id.pulso_widget_root, openAppIntent(context))
      if (variant.hasControls) views.setViewVisibility(R.id.pulso_btn_finish, View.GONE)

      if (snapshot.sessionDone) {
        renderComplete(views, snapshot, variant)
        return views
      }

      if (!snapshot.workoutActive || snapshot.currentExercise.isNullOrBlank()) {
        renderEmpty(views, snapshot, variant)
        return views
      }

      variant.eyebrow?.let { label ->
        views.setTextViewText(R.id.pulso_eyebrow, label)
        views.setTextColor(R.id.pulso_eyebrow, snapshot.accent)
        views.setViewVisibility(R.id.pulso_eyebrow, View.VISIBLE)
      }

      val detail = snapshot.setDetail
      val title = if (variant.showsDetail && !detail.isNullOrBlank()) {
        "${snapshot.currentExercise} · $detail"
      } else {
        snapshot.currentExercise
      }
      // Reset explicitly: the empty/complete states tint this row with the accent, and
      // RemoteViews carries that over into the next repaint otherwise.
      views.setTextColor(R.id.pulso_current, TITLE_COLOR)
      views.setTextViewText(R.id.pulso_current, title)

      views.setTextViewText(R.id.pulso_next, snapshot.nextExercise?.let { "SIG · $it" } ?: "")
      views.setViewVisibility(
        R.id.pulso_next,
        if (snapshot.nextExercise.isNullOrBlank()) View.GONE else View.VISIBLE,
      )

      if (variant.hasControls) {
        views.setViewVisibility(R.id.pulso_btn_finish, View.VISIBLE)
        views.setOnClickPendingIntent(R.id.pulso_btn_finish, openAppIntent(context, "entreno?action=finish"))
      }

      renderRest(context, views, snapshot, variant)
      return views
    }

    private fun renderEmpty(views: RemoteViews, snapshot: WidgetSnapshot, variant: PulsoWidgetVariant) {
      if (variant.eyebrow != null) {
        views.setTextViewText(R.id.pulso_eyebrow, "⚡ PULSO")
        views.setTextColor(R.id.pulso_eyebrow, snapshot.accent)
        views.setViewVisibility(R.id.pulso_eyebrow, View.VISIBLE)
        views.setTextViewText(R.id.pulso_current, "Comenzá tu entreno")
        views.setViewVisibility(R.id.pulso_next, View.GONE)
      } else {
        // The 1x1 has no eyebrow, so the title row carries the branding instead.
        views.setTextViewText(R.id.pulso_current, "⚡ PULSO")
        views.setTextColor(R.id.pulso_current, snapshot.accent)
        views.setTextViewText(R.id.pulso_next, "Comenzá tu entreno")
        views.setViewVisibility(R.id.pulso_next, View.VISIBLE)
      }

      views.setViewVisibility(R.id.pulso_chronometer, View.GONE)
      views.setViewVisibility(R.id.pulso_rest_idle, View.GONE)
      if (variant.hasControls) views.setViewVisibility(R.id.pulso_rest_actions, View.GONE)
    }

    /** Shown once the session is finished — same slots as [renderEmpty], different copy. */
    private fun renderComplete(views: RemoteViews, snapshot: WidgetSnapshot, variant: PulsoWidgetVariant) {
      if (variant.eyebrow != null) {
        views.setTextViewText(R.id.pulso_eyebrow, "⚡ PULSO")
        views.setTextColor(R.id.pulso_eyebrow, snapshot.accent)
        views.setViewVisibility(R.id.pulso_eyebrow, View.VISIBLE)
        views.setTextViewText(R.id.pulso_current, "¡Buen trabajo!")
        views.setViewVisibility(R.id.pulso_next, View.GONE)
      } else {
        views.setTextViewText(R.id.pulso_current, "⚡ ¡Buen trabajo!")
        views.setTextColor(R.id.pulso_current, snapshot.accent)
        views.setTextViewText(R.id.pulso_next, "Sesión completada")
        views.setViewVisibility(R.id.pulso_next, View.VISIBLE)
      }

      views.setViewVisibility(R.id.pulso_chronometer, View.GONE)
      views.setViewVisibility(R.id.pulso_rest_idle, View.GONE)
      if (variant.hasControls) views.setViewVisibility(R.id.pulso_rest_actions, View.GONE)
    }

    private fun renderRest(
      context: Context,
      views: RemoteViews,
      snapshot: WidgetSnapshot,
      variant: PulsoWidgetVariant,
    ) {
      if (!snapshot.resting) {
        views.setChronometer(R.id.pulso_chronometer, SystemClock.elapsedRealtime(), null, false)
        views.setViewVisibility(R.id.pulso_chronometer, View.GONE)
        views.setViewVisibility(R.id.pulso_rest_idle, View.VISIBLE)
        if (variant.hasControls) {
          views.setViewVisibility(R.id.pulso_rest_actions, View.GONE)
          // "✓ LISTO" quick-logs the displayed exercise — the widget can't write to the
          // app's database itself, so this just opens the app, which performs the log the
          // instant it mounts (see the `action=done` deep-link handling in entreno.tsx).
          val slotId = snapshot.currentSlotId
          if (slotId != null) {
            views.setOnClickPendingIntent(
              R.id.pulso_rest_idle,
              openAppIntent(context, "entreno?action=done&slotId=${Uri.encode(slotId)}"),
            )
          }
        }
        return
      }

      views.setViewVisibility(R.id.pulso_rest_idle, View.GONE)
      views.setViewVisibility(R.id.pulso_chronometer, View.VISIBLE)

      // Chronometer counts in the elapsedRealtime timebase, so translate the wall-clock
      // deadline we persist into it at paint time.
      val base = SystemClock.elapsedRealtime() + (snapshot.restEndAt - System.currentTimeMillis())
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        views.setChronometerCountDown(R.id.pulso_chronometer, true)
      }
      views.setChronometer(R.id.pulso_chronometer, base, null, true)

      if (!variant.hasControls) return
      views.setViewVisibility(R.id.pulso_rest_actions, View.VISIBLE)
      views.setOnClickPendingIntent(R.id.pulso_btn_reduce, broadcast(context, ACTION_REST_REDUCE))
      views.setOnClickPendingIntent(R.id.pulso_btn_skip, broadcast(context, ACTION_REST_SKIP))
      views.setOnClickPendingIntent(R.id.pulso_btn_add, broadcast(context, ACTION_REST_ADD))
    }

    /**
     * Deep-links straight into the Entreno tab (`pulso://<path>`) instead of just launching
     * the app — `path` can carry an `action=done|finish` query so the app auto-performs it
     * on mount (see the matching effect in `entreno.tsx`), since nothing native here can
     * touch the app's database directly. Each distinct path needs its own request code so
     * the body tap / "✓ LISTO" / "■ FIN" pending intents don't collide.
     */
    private fun openAppIntent(context: Context, path: String = "entreno"): PendingIntent {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse("pulso://$path"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      return PendingIntent.getActivity(context, path.hashCode(), intent, pendingIntentFlags())
    }

    private fun broadcast(context: Context, action: String): PendingIntent {
      val intent = Intent(context, PulsoWidgetLargeProvider::class.java).setAction(action)
      return PendingIntent.getBroadcast(context, action.hashCode(), intent, pendingIntentFlags())
    }

    /**
     * One alarm per rest period, at the deadline. Exact when the OS grants it, windowed
     * otherwise — a late repaint only means the idle state appears a moment after zero,
     * which is not worth prompting the user for the exact-alarm permission.
     */
    fun scheduleElapsedAlarm(context: Context, restEndAt: Long) {
      val alarms = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
      val intent = Intent(context, PulsoWidgetLargeProvider::class.java).setAction(ACTION_REST_ELAPSED)
      val pending = PendingIntent.getBroadcast(context, ACTION_REST_ELAPSED.hashCode(), intent, pendingIntentFlags())

      alarms.cancel(pending)
      if (restEndAt <= System.currentTimeMillis()) return

      val canBeExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()
      try {
        if (canBeExact) {
          alarms.setExact(AlarmManager.RTC_WAKEUP, restEndAt, pending)
        } else {
          alarms.setWindow(AlarmManager.RTC_WAKEUP, restEndAt, 1_000L, pending)
        }
      } catch (_: SecurityException) {
        alarms.setWindow(AlarmManager.RTC_WAKEUP, restEndAt, 1_000L, pending)
      }
    }
  }
}
