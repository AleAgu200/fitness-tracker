package expo.modules.pulsowatch

import android.content.Context
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

/**
 * Phone side of the Wear OS companion. State goes out as one urgent data item
 * (the watch always gets the latest, even after being offline); commands come
 * in as messages and acknowledgements go back as messages. No credentials
 * ever cross: payloads carry a pseudonymous account key only.
 */
class PulsoWatchModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is unavailable" }

  override fun definition() = ModuleDefinition {
    Name("PulsoWatch")

    Events(COMMAND_EVENT)

    OnCreate { live = WeakReference(this@PulsoWatchModule) }
    OnDestroy { live = null }

    AsyncFunction("publishState") { json: String ->
      val request = PutDataMapRequest.create(STATE_PATH).apply {
        dataMap.putString("json", json)
        dataMap.putLong("publishedAt", System.currentTimeMillis())
      }.asPutDataRequest().setUrgent()
      Tasks.await(Wearable.getDataClient(context).putDataItem(request))
      true
    }

    AsyncFunction("sendAck") { json: String ->
      val nodes = Tasks.await(Wearable.getNodeClient(context).connectedNodes)
      val bytes = json.toByteArray(Charsets.UTF_8)
      for (node in nodes) {
        runCatching { Tasks.await(Wearable.getMessageClient(context).sendMessage(node.id, ACK_PATH, bytes)) }
      }
      nodes.size
    }

    Function("takePendingCommands") {
      PulsoWatchQueue.drain(context)
    }

    AsyncFunction("isPaired") {
      runCatching { Tasks.await(Wearable.getNodeClient(context).connectedNodes).isNotEmpty() }.getOrDefault(false)
    }
  }

  companion object {
    const val COMMAND_EVENT = "onCommand"
    const val STATE_PATH = "/pulso/state"
    const val COMMAND_PATH = "/pulso/command"
    const val ACK_PATH = "/pulso/ack"

    private var live: WeakReference<PulsoWatchModule>? = null

    /** Queues a command and, if the app is running, wakes its JS to drain the queue. */
    fun deliver(context: Context, json: String) {
      PulsoWatchQueue.add(context, json)
      val module = live?.get() ?: return
      runCatching { module.sendEvent(COMMAND_EVENT, mapOf("pending" to true)) }
    }
  }
}
