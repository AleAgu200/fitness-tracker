package com.pulsofitness.wear.data

import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

// Mirror of pulso/src/lib/watch/protocol.ts. The phone owns the plan and the
// history; the watch sends commands and shows what the phone confirmed.

const val PROTOCOL_VERSION = 1
const val COMMAND_TTL_MS = 12L * 60 * 60 * 1000
const val REST_DEFAULT_SECONDS = 90

const val STATE_PATH = "/pulso/state"
const val COMMAND_PATH = "/pulso/command"
const val ACK_PATH = "/pulso/ack"

data class WatchSet(val weightKg: Double, val reps: Int)

data class WatchExercise(
    val slotId: String,
    val name: String,
    val targetSets: Int,
    val reps: Int,
    val weightKg: Double,
    val stepKg: Double,
    val sets: List<WatchSet>,
)

data class CommandResult(val commandId: String, val status: String, val reason: String?, val setId: String?)

data class Snapshot(
    /** Null when the phone is signed out: everything account-scoped is cleared. */
    val accountKey: String?,
    val sessionKey: String?,
    val revision: Long,
    val publishedAt: Long,
    val sessionDone: Boolean,
    val weightUnit: String,
    val currentIndex: Int,
    val exercises: List<WatchExercise>,
    val restEndAt: Long?,
    val restTotal: Int,
    val results: List<CommandResult>,
) {
    companion object {
        fun parse(json: String): Snapshot? = runCatching {
            val root = JSONObject(json)
            if (root.optInt("v") != PROTOCOL_VERSION) return null
            val exercises = root.optJSONArray("exercises") ?: JSONArray()
            val rest = root.optJSONObject("rest")
            val results = root.optJSONArray("results") ?: JSONArray()
            Snapshot(
                accountKey = root.optStringOrNull("accountKey"),
                sessionKey = root.optStringOrNull("sessionKey"),
                revision = root.optLong("revision"),
                publishedAt = root.optLong("publishedAt"),
                sessionDone = root.optBoolean("sessionDone"),
                weightUnit = root.optString("weightUnit", "kg"),
                currentIndex = root.optInt("currentIndex"),
                exercises = (0 until exercises.length()).map { index ->
                    val item = exercises.getJSONObject(index)
                    val sets = item.optJSONArray("sets") ?: JSONArray()
                    WatchExercise(
                        slotId = item.getString("slotId"),
                        name = item.getString("name"),
                        targetSets = item.optInt("targetSets"),
                        reps = item.optInt("reps"),
                        weightKg = item.optDouble("weightKg", 0.0),
                        stepKg = item.optDouble("stepKg", 2.5),
                        sets = (0 until sets.length()).map { setIndex ->
                            val set = sets.getJSONObject(setIndex)
                            WatchSet(set.optDouble("weightKg", 0.0), set.optInt("reps"))
                        },
                    )
                },
                restEndAt = rest?.let { if (it.isNull("endAt")) null else it.optLong("endAt") },
                restTotal = rest?.optInt("total") ?: 0,
                results = (0 until results.length()).mapNotNull { parseResult(results.getJSONObject(it)) },
            )
        }.getOrNull()
    }
}

data class Command(
    val commandId: String,
    val type: String,
    val accountKey: String,
    val sessionKey: String,
    val seq: Long,
    val baseRevision: Long,
    val issuedAt: Long,
    val expiresAt: Long,
    val slotId: String? = null,
    val weightKg: Double? = null,
    val reps: Int? = null,
    val targetCommandId: String? = null,
    val index: Int? = null,
    val seconds: Int? = null,
) {
    fun toJson(): String = JSONObject().apply {
        put("v", PROTOCOL_VERSION)
        put("commandId", commandId)
        put("type", type)
        put("accountKey", accountKey)
        put("sessionKey", sessionKey)
        put("seq", seq)
        put("baseRevision", baseRevision)
        put("issuedAt", issuedAt)
        put("expiresAt", expiresAt)
        slotId?.let { put("slotId", it) }
        weightKg?.let { put("weightKg", it) }
        reps?.let { put("reps", it) }
        targetCommandId?.let { put("targetCommandId", it) }
        index?.let { put("index", it) }
        seconds?.let { put("seconds", it) }
    }.toString()

    companion object {
        /** 24 URL-safe characters: matches the phone's ID rule. */
        fun newId(): String = "w" + UUID.randomUUID().toString().replace("-", "").take(23)

        fun fromJson(json: String): Command? = runCatching {
            val root = JSONObject(json)
            Command(
                commandId = root.getString("commandId"),
                type = root.getString("type"),
                accountKey = root.getString("accountKey"),
                sessionKey = root.getString("sessionKey"),
                seq = root.getLong("seq"),
                baseRevision = root.getLong("baseRevision"),
                issuedAt = root.getLong("issuedAt"),
                expiresAt = root.getLong("expiresAt"),
                slotId = root.optStringOrNull("slotId"),
                weightKg = if (root.has("weightKg")) root.getDouble("weightKg") else null,
                reps = if (root.has("reps")) root.getInt("reps") else null,
                targetCommandId = root.optStringOrNull("targetCommandId"),
                index = if (root.has("index")) root.getInt("index") else null,
                seconds = if (root.has("seconds")) root.getInt("seconds") else null,
            )
        }.getOrNull()
    }
}

fun parseResult(json: String): CommandResult? = runCatching { parseResult(JSONObject(json)) }.getOrNull()

fun parseResult(root: JSONObject): CommandResult? {
    val commandId = root.optStringOrNull("commandId") ?: return null
    val status = root.optStringOrNull("status") ?: return null
    return CommandResult(commandId, status, root.optStringOrNull("reason"), root.optStringOrNull("setId"))
}

/** What the athlete reads when the phone refuses a command. */
fun reasonText(reason: String?): String = when (reason) {
    "wrong_account" -> "Es de otra cuenta"
    "stale_session" -> "Era de otra sesión"
    "session_ended" -> "La sesión ya terminó"
    "expired" -> "Venció sin llegar al teléfono"
    "unknown_exercise" -> "Ese ejercicio ya no está en el plan"
    "conflict" -> "Se registró otra serie después: corregilo en el teléfono"
    "already_synced" -> "Ya se sincronizó: corregilo en el teléfono"
    "not_found" -> "No se encontró la serie"
    else -> "El teléfono no lo aceptó"
}

private fun JSONObject.optStringOrNull(key: String): String? =
    if (!has(key) || isNull(key)) null else optString(key).takeIf { it.isNotEmpty() }
