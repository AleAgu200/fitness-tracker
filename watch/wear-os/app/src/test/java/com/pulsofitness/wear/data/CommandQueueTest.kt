package com.pulsofitness.wear.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CommandQueueTest {
    private class MemoryStore : KeyValueStore {
        val values = mutableMapOf<String, String>()
        override fun get(key: String) = values[key]
        override fun put(key: String, value: String) { values[key] = value }
    }

    private fun log(id: String, account: String = "acct", issuedAt: Long = 1_000L, expiresAt: Long = Long.MAX_VALUE) =
        Command(id, "log_set", account, "2026-10-04:tpl", 1, 1, issuedAt, expiresAt, slotId = "slot1", weightKg = 60.0, reps = 8)

    @Test
    fun commandsSurviveAndRoundTripThroughJson() {
        val store = MemoryStore()
        CommandQueue(store).enqueue(log("w0000000001"))
        val reloaded = CommandQueue(store).all()
        assertEquals(1, reloaded.size)
        assertEquals(60.0, reloaded[0].command.weightKg!!, 0.0)
        assertEquals("queued", reloaded[0].status)
    }

    @Test
    fun enqueuingTheSameIdTwiceKeepsOne() {
        val queue = CommandQueue(MemoryStore())
        queue.enqueue(log("w0000000001"))
        queue.enqueue(log("w0000000001"))
        assertEquals(1, queue.all().size)
    }

    @Test
    fun pendingSkipsExpiredAndAnswered() {
        val queue = CommandQueue(MemoryStore())
        queue.enqueue(log("w0000000001"))
        queue.enqueue(log("w0000000002", expiresAt = 500L))
        queue.enqueue(log("w0000000003"))
        queue.applyResult(CommandResult("w0000000003", "saved", null, "set3"))
        assertEquals(listOf("w0000000001"), queue.pending(now = 1_000L).map { it.commandId })
    }

    @Test
    fun aResultIsAppliedOnceAndLaterRepeatsAreIgnored() {
        val queue = CommandQueue(MemoryStore())
        queue.enqueue(log("w0000000001"))
        assertTrue(queue.applyResult(CommandResult("w0000000001", "saved", null, "set1"), now = 10))
        assertFalse(queue.applyResult(CommandResult("w0000000001", "rejected", "expired", null), now = 20))
        assertEquals("saved", queue.all()[0].status)
    }

    @Test
    fun anUnsentSetIsWithdrawnLocallyButASentOneIsNot() {
        val queue = CommandQueue(MemoryStore())
        queue.enqueue(log("w0000000001"))
        queue.enqueue(log("w0000000002"))
        queue.markSent("w0000000002")
        assertTrue(queue.withdrawUnsent("w0000000001"))
        assertFalse(queue.withdrawUnsent("w0000000002"))
        assertEquals(listOf("w0000000002"), queue.all().map { it.command.commandId })
    }

    @Test
    fun anAccountSwitchOrSignOutClearsTheOtherAccount() {
        val queue = CommandQueue(MemoryStore())
        queue.enqueue(log("w0000000001", account = "a"))
        queue.enqueue(log("w0000000002", account = "b"))
        assertEquals(1, queue.keepOnlyAccount("b"))
        assertEquals(listOf("w0000000002"), queue.all().map { it.command.commandId })
        assertEquals(1, queue.keepOnlyAccount(null))
        assertTrue(queue.all().isEmpty())
    }

    @Test
    fun displayAddsInFlightSetsAndRemovesUndoneOnes() {
        val snapshot = Snapshot(
            accountKey = "acct", sessionKey = "2026-10-04:tpl", revision = 5, publishedAt = 100, sessionDone = false,
            weightUnit = "kg", currentIndex = 0,
            exercises = listOf(WatchExercise("slot1", "Sentadilla", 4, 8, 60.0, 2.5, listOf(WatchSet(60.0, 8)))),
            restEndAt = null, restTotal = 90, results = emptyList(),
        )
        val queue = CommandQueue(MemoryStore())
        queue.enqueue(log("w0000000001", issuedAt = 200))
        assertEquals(2, displaySets(snapshot, queue.all())["slot1"]!!.size)

        queue.applyResult(CommandResult("w0000000001", "saved", null, "set1"), now = 300)
        assertEquals("confirmed after this snapshot: still shown", 2, displaySets(snapshot, queue.all())["slot1"]!!.size)

        queue.enqueue(Command("w0000000002", "undo_set", "acct", "2026-10-04:tpl", 2, 5, 400, Long.MAX_VALUE, targetCommandId = "w0000000001"))
        assertEquals(1, displaySets(snapshot, queue.all())["slot1"]!!.size)
    }

    @Test
    fun snapshotParsesTheSignedOutState() {
        val parsed = Snapshot.parse("""{"v":1,"accountKey":null,"sessionKey":null,"revision":1,"publishedAt":1,"sessionDone":false,"weightUnit":"kg","currentIndex":0,"exercises":[],"rest":{"endAt":null,"total":0},"results":[]}""")
        assertNull(parsed!!.accountKey)
        assertNull(Snapshot.parse("""{"v":2}"""))
    }

    @Test
    fun idsMatchThePhoneRule() {
        val id = Command.newId()
        assertTrue(Regex("^[A-Za-z0-9_-]{8,64}$").matches(id))
    }
}
