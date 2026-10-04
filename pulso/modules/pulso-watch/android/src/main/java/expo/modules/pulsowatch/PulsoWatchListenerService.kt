package expo.modules.pulsowatch

import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

/** Started by Google Play services when the watch sends a command, with or without the app running. */
class PulsoWatchListenerService : WearableListenerService() {
  override fun onMessageReceived(event: MessageEvent) {
    if (event.path != PulsoWatchModule.COMMAND_PATH) return
    PulsoWatchModule.deliver(applicationContext, String(event.data, Charsets.UTF_8))
  }
}
