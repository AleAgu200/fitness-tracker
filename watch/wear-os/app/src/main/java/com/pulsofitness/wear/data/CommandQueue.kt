package com.pulsofitness.wear.data

import org.json.JSONArray
import org.json.JSONObject

/** Persistence seam: SharedPreferences on the watch, a map in unit tests. */
interface KeyValueStore {
    fun get(key: String): String?
    fun put(key: String, value: String)
}

/**
 * Commands issued on the watch, persisted until the phone answers. Offline,
 * they wait here and are resent; the phone applies each command ID once and
 * answers repeats from its own record, so resending is always safe.
 */
class CommandQueue(private val store: KeyValueStore) {

    data class Entry(
        val command: Command,
        /** queued (not confirmed yet), saved, rejected */
        val status: String,
        val reason: String?,
        val setId: String?,
        val attempts: Int,
        val resolvedAt: Long?,
    )

    @Synchronized
    fun all(): List<Entry> = load()

    @Synchronized
    fun nextSeq(): Long {
        val next = (store.get(SEQ_KEY)?.toLongOrNull() ?: 0L) + 1
        store.put(SEQ_KEY, next.toString())
        return next
    }

    @Synchronized
    fun enqueue(command: Command) {
        val entries = load()
        if (entries.any { it.command.commandId == command.commandId }) return
        save(entries + Entry(command, "queued", null, null, 0, null))
    }

    /** Commands still waiting for the phone, oldest first; expired ones are not resent. */
    @Synchronized
    fun pending(now: Long): List<Command> =
        load().filter { it.status == "queued" && it.command.expiresAt > now }.map { it.command }

    @Synchronized
    fun markSent(commandId: String) {
        save(load().map { if (it.command.commandId == commandId) it.copy(attempts = it.attempts + 1) else it })
    }

    /** Applies the phone's answer; returns true when something changed. */
    @Synchronized
    fun applyResult(result: CommandResult, now: Long = System.currentTimeMillis()): Boolean {
        var changed = false
        val updated = load().map { entry ->
            if (entry.command.commandId == result.commandId && entry.status == "queued") {
                changed = true
                entry.copy(status = result.status, reason = result.reason, setId = result.setId, resolvedAt = now)
            } else {
                entry
            }
        }
        if (changed) save(updated)
        return changed
    }

    /**
     * Withdraws a set that never reached the phone (no attempt was made): it is
     * simply forgotten. Returns false when it may have been delivered, in which
     * case an undo command must be sent instead.
     */
    @Synchronized
    fun withdrawUnsent(commandId: String): Boolean {
        val entries = load()
        val entry = entries.firstOrNull { it.command.commandId == commandId } ?: return false
        if (entry.status != "queued" || entry.attempts > 0) return false
        save(entries.filterNot { it.command.commandId == commandId })
        return true
    }

    /** After a sign-out or account switch, nothing of the previous account stays on the watch. */
    @Synchronized
    fun keepOnlyAccount(accountKey: String?): Int {
        val entries = load()
        val kept = if (accountKey == null) emptyList() else entries.filter { it.command.accountKey == accountKey }
        if (kept.size != entries.size) save(kept)
        return entries.size - kept.size
    }

    /** Keeps the history short: answered commands older than the newest 50 go. */
    @Synchronized
    fun prune() {
        val entries = load()
        val resolved = entries.filter { it.status != "queued" }
        if (resolved.size <= MAX_RESOLVED) return
        val drop = resolved.sortedBy { it.resolvedAt ?: 0L }.take(resolved.size - MAX_RESOLVED).map { it.command.commandId }.toSet()
        save(entries.filterNot { it.command.commandId in drop })
    }

    private fun load(): List<Entry> {
        val raw = store.get(QUEUE_KEY) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            (0 until array.length()).mapNotNull { index ->
                val item = array.getJSONObject(index)
                val command = Command.fromJson(item.getString("command")) ?: return@mapNotNull null
                Entry(
                    command = command,
                    status = item.getString("status"),
                    reason = if (item.isNull("reason")) null else item.optString("reason"),
                    setId = if (item.isNull("setId")) null else item.optString("setId"),
                    attempts = item.optInt("attempts"),
                    resolvedAt = if (item.isNull("resolvedAt")) null else item.optLong("resolvedAt"),
                )
            }
        }.getOrDefault(emptyList())
    }

    private fun save(entries: List<Entry>) {
        val array = JSONArray()
        for (entry in entries) {
            array.put(JSONObject().apply {
                put("command", entry.command.toJson())
                put("status", entry.status)
                put("reason", entry.reason ?: JSONObject.NULL)
                put("setId", entry.setId ?: JSONObject.NULL)
                put("attempts", entry.attempts)
                put("resolvedAt", entry.resolvedAt ?: JSONObject.NULL)
            })
        }
        store.put(QUEUE_KEY, array.toString())
    }

    companion object {
        private const val QUEUE_KEY = "commands"
        private const val SEQ_KEY = "seq"
        private const val MAX_RESOLVED = 50
    }
}

/**
 * What the watch shows for each exercise: the phone's confirmed sets plus the
 * ones still on their way (queued, or confirmed after this snapshot was made),
 * minus sets whose undo is on its way.
 */
fun displaySets(snapshot: Snapshot, entries: List<CommandQueue.Entry>): Map<String, List<WatchSet>> {
    val result = snapshot.exercises.associate { it.slotId to it.sets.toMutableList() }
    val inFlight = entries.filter {
        it.command.accountKey == snapshot.accountKey &&
            it.command.sessionKey == snapshot.sessionKey &&
            (it.status == "queued" || (it.status == "saved" && (it.resolvedAt ?: 0L) > snapshot.publishedAt))
    }.sortedWith(compareBy({ it.command.issuedAt }, { it.command.seq }))
    for (entry in inFlight) {
        val command = entry.command
        when (command.type) {
            "log_set" -> result[command.slotId]?.add(WatchSet(command.weightKg ?: 0.0, command.reps ?: 0))
            "undo_set" -> {
                val target = entries.firstOrNull { it.command.commandId == command.targetCommandId }?.command
                target?.slotId?.let { slot -> result[slot]?.let { sets -> if (sets.isNotEmpty()) sets.removeAt(sets.lastIndex) } }
            }
        }
    }
    return result
}
