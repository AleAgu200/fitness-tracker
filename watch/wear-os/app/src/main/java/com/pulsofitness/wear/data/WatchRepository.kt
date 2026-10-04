package com.pulsofitness.wear.data

import android.content.Context
import android.net.Uri
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/**
 * The watch's view of the phone: the latest snapshot (a data item, so it is
 * there even after being offline) and the local command queue. Commands go to
 * the phone as messages and are resent every 15 s until the phone answers.
 */
class WatchRepository private constructor(private val context: Context) :
    DataClient.OnDataChangedListener, MessageClient.OnMessageReceivedListener {

    private val queue = CommandQueue(object : KeyValueStore {
        private val prefs = context.getSharedPreferences("pulso_wear", Context.MODE_PRIVATE)
        override fun get(key: String): String? = prefs.getString(key, null)
        override fun put(key: String, value: String) { prefs.edit().putString(key, value).apply() }
    })

    private val _snapshot = MutableStateFlow<Snapshot?>(null)
    val snapshot: StateFlow<Snapshot?> = _snapshot
    private val _entries = MutableStateFlow(queue.all())
    val entries: StateFlow<List<CommandQueue.Entry>> = _entries
    private val _phoneConnected = MutableStateFlow(false)
    val phoneConnected: StateFlow<Boolean> = _phoneConnected
    /** Set when a sign-out or account switch discarded unsent commands. */
    private val _notice = MutableStateFlow<String?>(null)
    val notice: StateFlow<String?> = _notice

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var resendLoop: Job? = null

    fun start() {
        Wearable.getDataClient(context).addListener(this)
        Wearable.getMessageClient(context).addListener(this)
        scope.launch { loadLatestState(); flush() }
        resendLoop?.cancel()
        resendLoop = scope.launch {
            while (isActive) {
                delay(15_000)
                flush()
            }
        }
    }

    fun stop() {
        Wearable.getDataClient(context).removeListener(this)
        Wearable.getMessageClient(context).removeListener(this)
        resendLoop?.cancel()
    }

    fun dismissNotice() { _notice.value = null }

    override fun onDataChanged(events: DataEventBuffer) {
        for (event in events) {
            if (event.type == DataEvent.TYPE_CHANGED && event.dataItem.uri.path == STATE_PATH) {
                DataMapItem.fromDataItem(event.dataItem).dataMap.getString("json")?.let(::applySnapshot)
            }
        }
    }

    override fun onMessageReceived(event: MessageEvent) {
        if (event.path != ACK_PATH) return
        parseResult(String(event.data, Charsets.UTF_8))?.let {
            if (queue.applyResult(it)) publishEntries()
        }
    }

    private suspend fun loadLatestState() {
        runCatching {
            val uri = Uri.Builder().scheme("wear").path(STATE_PATH).build()
            val items = Wearable.getDataClient(context).getDataItems(uri).await()
            items.forEach { item -> DataMapItem.fromDataItem(item).dataMap.getString("json")?.let(::applySnapshot) }
            items.release()
        }
    }

    private fun applySnapshot(json: String) {
        val next = Snapshot.parse(json) ?: return
        val current = _snapshot.value
        if (current != null && next.revision < current.revision) return
        // Nothing account-scoped survives a sign-out or a different account.
        val dropped = queue.keepOnlyAccount(next.accountKey)
        if (dropped > 0) _notice.value = "Cambió la cuenta en el teléfono: se descartaron $dropped acciones sin enviar."
        next.results.forEach { queue.applyResult(it) }
        queue.prune()
        _snapshot.value = next
        publishEntries()
    }

    private fun publishEntries() { _entries.value = queue.all() }

    suspend fun flush() {
        val pending = queue.pending(System.currentTimeMillis())
        val nodes = runCatching { Wearable.getNodeClient(context).connectedNodes.await() }.getOrDefault(emptyList())
        _phoneConnected.value = nodes.isNotEmpty()
        if (pending.isEmpty() || nodes.isEmpty()) return
        val client = Wearable.getMessageClient(context)
        for (command in pending) {
            val bytes = command.toJson().toByteArray(Charsets.UTF_8)
            for (node in nodes) {
                runCatching { client.sendMessage(node.id, COMMAND_PATH, bytes).await() }
                    .onSuccess { queue.markSent(command.commandId) }
            }
        }
        publishEntries()
    }

    private fun issue(build: (accountKey: String, sessionKey: String, now: Long, seq: Long, revision: Long) -> Command): Boolean {
        val current = _snapshot.value ?: return false
        val accountKey = current.accountKey ?: return false
        val sessionKey = current.sessionKey ?: return false
        val now = System.currentTimeMillis()
        queue.enqueue(build(accountKey, sessionKey, now, queue.nextSeq(), current.revision))
        publishEntries()
        scope.launch { flush() }
        return true
    }

    fun logSet(slotId: String, weightKg: Double, reps: Int): Boolean = issue { account, session, now, seq, revision ->
        Command(Command.newId(), "log_set", account, session, seq, revision, now, now + COMMAND_TTL_MS, slotId = slotId, weightKg = weightKg, reps = reps)
    }

    /** Undoes this watch's last set on an exercise: forgotten if never sent, otherwise an undo command. */
    fun undoLast(slotId: String): Boolean {
        val target = queue.all().lastOrNull {
            it.command.type == "log_set" && it.command.slotId == slotId && it.status != "rejected" &&
                queue.all().none { other -> other.command.type == "undo_set" && other.command.targetCommandId == it.command.commandId && other.status != "rejected" }
        } ?: return false
        if (queue.withdrawUnsent(target.command.commandId)) {
            publishEntries()
            return true
        }
        return issue { account, session, now, seq, revision ->
            Command(Command.newId(), "undo_set", account, session, seq, revision, now, now + COMMAND_TTL_MS, targetCommandId = target.command.commandId)
        }
    }

    fun selectExercise(index: Int): Boolean = issue { account, session, now, seq, revision ->
        Command(Command.newId(), "select_exercise", account, session, seq, revision, now, now + COMMAND_TTL_MS, index = index)
    }

    fun skipRest(): Boolean = issue { account, session, now, seq, revision ->
        Command(Command.newId(), "skip_rest", account, session, seq, revision, now, now + COMMAND_TTL_MS)
    }

    companion object {
        @Volatile private var instance: WatchRepository? = null
        fun get(context: Context): WatchRepository =
            instance ?: synchronized(this) { instance ?: WatchRepository(context.applicationContext).also { instance = it } }
    }
}
