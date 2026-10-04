package expo.modules.pulsowatch

import android.content.Context
import org.json.JSONArray

/**
 * Commands received from the watch, kept until the app's JS drains them. The
 * watch resends anything not acknowledged, and the phone answers repeats from
 * its own record, so a command lost or delivered twice here is harmless.
 */
object PulsoWatchQueue {
  private const val PREFS = "pulso_watch"
  private const val KEY = "queue"
  private const val MAX = 500

  @Synchronized
  fun add(context: Context, json: String) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val queue = JSONArray(prefs.getString(KEY, "[]"))
    for (index in 0 until queue.length()) if (queue.getString(index) == json) return
    queue.put(json)
    while (queue.length() > MAX) queue.remove(0)
    prefs.edit().putString(KEY, queue.toString()).apply()
  }

  @Synchronized
  fun drain(context: Context): List<String> {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val queue = JSONArray(prefs.getString(KEY, "[]"))
    prefs.edit().putString(KEY, "[]").apply()
    return (0 until queue.length()).map { queue.getString(it) }
  }
}
