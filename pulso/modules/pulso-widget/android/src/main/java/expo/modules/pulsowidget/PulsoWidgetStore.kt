package expo.modules.pulsowidget

import android.content.Context
import android.graphics.Color
import org.json.JSONObject

/**
 * Cross-process workout snapshot backing the home-screen widgets.
 *
 * SharedPreferences (not SecureStore, which the app uses elsewhere) because the widget
 * provider has to read and mutate this from a broadcast receiver while the RN process is
 * dead — nothing here is sensitive, and the provider needs a plain synchronous read.
 */
data class WidgetSnapshot(
  val workoutActive: Boolean,
  val currentExercise: String?,
  val nextExercise: String?,
  val setDetail: String?,
  val accent: Int,
  /** Wall-clock ms when the rest period ends, or 0 when not resting. */
  val restEndAt: Long,
  val restTotal: Int,
) {
  val resting: Boolean get() = restEndAt > System.currentTimeMillis()

  fun toJson(): JSONObject = JSONObject().apply {
    put("workoutActive", workoutActive)
    put("currentExercise", currentExercise ?: JSONObject.NULL)
    put("nextExercise", nextExercise ?: JSONObject.NULL)
    put("setDetail", setDetail ?: JSONObject.NULL)
    put("restEndAt", if (restEndAt > 0) restEndAt else JSONObject.NULL)
    put("restTotal", restTotal)
  }
}

object PulsoWidgetStore {
  private const val PREFS = "pulso_widget_store"
  private const val KEY_ACTIVE = "workout_active"
  private const val KEY_CURRENT = "current_exercise"
  private const val KEY_NEXT = "next_exercise"
  private const val KEY_DETAIL = "set_detail"
  private const val KEY_ACCENT = "accent"
  private const val KEY_REST_END_AT = "rest_end_at"
  private const val KEY_REST_TOTAL = "rest_total"

  private const val DEFAULT_ACCENT = "#E8FF59"

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun read(context: Context): WidgetSnapshot {
    val p = prefs(context)
    val accent = try {
      Color.parseColor(p.getString(KEY_ACCENT, DEFAULT_ACCENT) ?: DEFAULT_ACCENT)
    } catch (_: IllegalArgumentException) {
      Color.parseColor(DEFAULT_ACCENT)
    }
    return WidgetSnapshot(
      workoutActive = p.getBoolean(KEY_ACTIVE, false),
      currentExercise = p.getString(KEY_CURRENT, null),
      nextExercise = p.getString(KEY_NEXT, null),
      setDetail = p.getString(KEY_DETAIL, null),
      accent = accent,
      restEndAt = p.getLong(KEY_REST_END_AT, 0L),
      restTotal = p.getInt(KEY_REST_TOTAL, 0),
    )
  }

  /** Writes the exercise half of the snapshot, leaving rest-timer keys untouched. */
  fun writeWorkout(
    context: Context,
    workoutActive: Boolean,
    currentExercise: String?,
    nextExercise: String?,
    setDetail: String?,
    accent: String?,
  ) {
    prefs(context).edit()
      .putBoolean(KEY_ACTIVE, workoutActive)
      .putString(KEY_CURRENT, currentExercise)
      .putString(KEY_NEXT, nextExercise)
      .putString(KEY_DETAIL, setDetail)
      .putString(KEY_ACCENT, accent ?: DEFAULT_ACCENT)
      .apply()
  }

  fun writeRest(context: Context, restEndAt: Long, restTotal: Int) {
    prefs(context).edit()
      .putLong(KEY_REST_END_AT, restEndAt)
      .putInt(KEY_REST_TOTAL, restTotal)
      .apply()
  }

  fun clearRest(context: Context) = writeRest(context, 0L, 0)

  /**
   * Shifts the rest deadline by [deltaMs], clamped so it can never land in the past.
   * Returns the new deadline, or 0 when the shift consumed the remaining time.
   */
  fun shiftRest(context: Context, deltaMs: Long): Long {
    val current = read(context)
    if (current.restEndAt <= 0L) return 0L

    val next = current.restEndAt + deltaMs
    if (next <= System.currentTimeMillis()) {
      clearRest(context)
      return 0L
    }

    val remaining = ((next - System.currentTimeMillis()) / 1000).toInt()
    writeRest(context, next, maxOf(current.restTotal, remaining))
    return next
  }
}
