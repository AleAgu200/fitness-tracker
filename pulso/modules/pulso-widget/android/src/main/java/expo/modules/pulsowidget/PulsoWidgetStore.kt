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
  val sessionDone: Boolean,
  val currentExercise: String?,
  /** Plan-slot id of the active exercise — carried into the "✓ LISTO" deep link. */
  val currentSlotId: String?,
  val nextExercise: String?,
  val nextExercises: String?,
  val setDetail: String?,
  val setProgress: String?,
  val sessionVolume: String?,
  val setHistory: String?,
  val muscleGroup: String?,
  val accent: Int,
  /** Wall-clock ms when the rest period ends, or 0 when not resting. */
  val restEndAt: Long,
  val restTotal: Int,
) {
  val resting: Boolean get() = restEndAt > System.currentTimeMillis()

  fun toJson(): JSONObject = JSONObject().apply {
    put("workoutActive", workoutActive)
    put("sessionDone", sessionDone)
    put("currentExercise", currentExercise ?: JSONObject.NULL)
    put("currentSlotId", currentSlotId ?: JSONObject.NULL)
    put("nextExercise", nextExercise ?: JSONObject.NULL)
    put("nextExercises", nextExercises ?: JSONObject.NULL)
    put("setDetail", setDetail ?: JSONObject.NULL)
    put("setProgress", setProgress ?: JSONObject.NULL)
    put("sessionVolume", sessionVolume ?: JSONObject.NULL)
    put("setHistory", setHistory ?: JSONObject.NULL)
    put("muscleGroup", muscleGroup ?: JSONObject.NULL)
    put("restEndAt", if (restEndAt > 0) restEndAt else JSONObject.NULL)
    put("restTotal", restTotal)
  }
}

object PulsoWidgetStore {
  private const val PREFS = "pulso_widget_store"
  private const val KEY_ACTIVE = "workout_active"
  private const val KEY_SESSION_DONE = "session_done"
  private const val KEY_CURRENT = "current_exercise"
  private const val KEY_SLOT_ID = "current_slot_id"
  private const val KEY_NEXT = "next_exercise"
  private const val KEY_NEXT_EXERCISES = "next_exercises"
  private const val KEY_DETAIL = "set_detail"
  private const val KEY_PROGRESS = "set_progress"
  private const val KEY_VOLUME = "session_volume"
  private const val KEY_HISTORY = "set_history"
  private const val KEY_MUSCLE = "muscle_group"
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
      sessionDone = p.getBoolean(KEY_SESSION_DONE, false),
      currentExercise = p.getString(KEY_CURRENT, null),
      currentSlotId = p.getString(KEY_SLOT_ID, null),
      nextExercise = p.getString(KEY_NEXT, null),
      nextExercises = p.getString(KEY_NEXT_EXERCISES, null),
      setDetail = p.getString(KEY_DETAIL, null),
      setProgress = p.getString(KEY_PROGRESS, null),
      sessionVolume = p.getString(KEY_VOLUME, null),
      setHistory = p.getString(KEY_HISTORY, null),
      muscleGroup = p.getString(KEY_MUSCLE, null),
      accent = accent,
      restEndAt = p.getLong(KEY_REST_END_AT, 0L),
      restTotal = p.getInt(KEY_REST_TOTAL, 0),
    )
  }

  /** Writes the exercise half of the snapshot, leaving rest-timer keys untouched. */
  fun writeWorkout(
    context: Context,
    workoutActive: Boolean,
    sessionDone: Boolean,
    currentExercise: String?,
    currentSlotId: String?,
    nextExercise: String?,
    nextExercises: String?,
    setDetail: String?,
    setProgress: String?,
    sessionVolume: String?,
    setHistory: String?,
    muscleGroup: String?,
    accent: String?,
  ) {
    prefs(context).edit()
      .putBoolean(KEY_ACTIVE, workoutActive)
      .putBoolean(KEY_SESSION_DONE, sessionDone)
      .putString(KEY_CURRENT, currentExercise)
      .putString(KEY_SLOT_ID, currentSlotId)
      .putString(KEY_NEXT, nextExercise)
      .putString(KEY_NEXT_EXERCISES, nextExercises)
      .putString(KEY_DETAIL, setDetail)
      .putString(KEY_PROGRESS, setProgress)
      .putString(KEY_VOLUME, sessionVolume)
      .putString(KEY_HISTORY, setHistory)
      .putString(KEY_MUSCLE, muscleGroup)
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
