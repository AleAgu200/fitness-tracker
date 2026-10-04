package com.pulsofitness.wear.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CompactButton
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import com.pulsofitness.wear.data.REST_DEFAULT_SECONDS
import com.pulsofitness.wear.data.Snapshot
import com.pulsofitness.wear.data.WatchRepository
import com.pulsofitness.wear.data.WatchSet
import com.pulsofitness.wear.data.displaySets
import com.pulsofitness.wear.data.reasonText
import kotlinx.coroutines.delay
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToInt

private val Accent = Color(0xFF3DDCFF)
private const val KG_TO_LB = 2.2046226218

private fun formatWeight(kg: Double, unit: String): String {
    val value = if (unit == "lb") kg * KG_TO_LB else kg
    val text = if (value % 1.0 == 0.0) value.roundToInt().toString() else String.format(Locale.US, "%.1f", value)
    return "$text $unit"
}

@Composable
fun PulsoWearScreen(repository: WatchRepository) {
    val snapshot by repository.snapshot.collectAsStateWithLifecycle()
    val entries by repository.entries.collectAsStateWithLifecycle()
    val connected by repository.phoneConnected.collectAsStateWithLifecycle()
    val notice by repository.notice.collectAsStateWithLifecycle()
    // Rest started on the watch shows at once, before the phone's snapshot arrives.
    var localRestEnd by remember { mutableLongStateOf(0L) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = System.currentTimeMillis()
            delay(1_000)
        }
    }

    MaterialTheme {
        Scaffold(timeText = { TimeText() }) {
            val current = snapshot
            when {
                notice != null -> Message(notice!!, action = "OK") { repository.dismissNotice() }
                current == null -> Message("Abrí PULSO en tu teléfono para empezar.")
                current.accountKey == null -> Message("Iniciá sesión en PULSO en tu teléfono.")
                current.sessionKey == null || current.exercises.isEmpty() -> Message("Hoy no hay entreno en tu plan.")
                current.sessionDone -> Message("Sesión completada. Buen trabajo.")
                else -> {
                    val restEnd = max(current.restEndAt ?: 0L, localRestEnd)
                    if (restEnd > now) {
                        RestScreen(secondsLeft = ((restEnd - now) / 1000).toInt() + 1) {
                            localRestEnd = 0L
                            repository.skipRest()
                        }
                    } else {
                        ExerciseScreen(
                            snapshot = current,
                            sets = displaySets(current, entries),
                            queued = entries.count { it.status == "queued" },
                            lastRejection = entries.lastOrNull { it.status == "rejected" }?.let { reasonText(it.reason) },
                            connected = connected,
                            repository = repository,
                            onLogged = { localRestEnd = System.currentTimeMillis() + REST_DEFAULT_SECONDS * 1000L },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun Message(text: String, action: String? = null, onAction: () -> Unit = {}) {
    Box(Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.Center) {
        ScalingLazyColumn(horizontalAlignment = Alignment.CenterHorizontally) {
            item { Text(text, textAlign = TextAlign.Center) }
            if (action != null) item { Chip(label = { Text(action) }, onClick = onAction, colors = ChipDefaults.secondaryChipColors()) }
        }
    }
}

@Composable
private fun RestScreen(secondsLeft: Int, onSkip: () -> Unit) {
    ScalingLazyColumn(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
        item { Text("DESCANSO", color = Accent, fontSize = 12.sp) }
        item {
            Text(
                "%d:%02d".format(secondsLeft / 60, secondsLeft % 60),
                fontSize = 40.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.semantics { contentDescription = "$secondsLeft segundos de descanso" },
            )
        }
        item { Chip(label = { Text("SALTAR") }, onClick = onSkip, colors = ChipDefaults.secondaryChipColors()) }
    }
}

@Composable
private fun ExerciseScreen(
    snapshot: Snapshot,
    sets: Map<String, List<WatchSet>>,
    queued: Int,
    lastRejection: String?,
    connected: Boolean,
    repository: WatchRepository,
    onLogged: () -> Unit,
) {
    var index by remember(snapshot.sessionKey) { mutableIntStateOf(snapshot.currentIndex.coerceIn(0, snapshot.exercises.lastIndex)) }
    val exercise = snapshot.exercises[index.coerceIn(0, snapshot.exercises.lastIndex)]
    val done = sets[exercise.slotId].orEmpty()
    // Steppers start from the last set of this exercise, else from the plan.
    val weights = remember { mutableStateMapOf<String, Double>() }
    val repsBySlot = remember { mutableStateMapOf<String, Int>() }
    val weight = weights[exercise.slotId] ?: done.lastOrNull()?.weightKg ?: exercise.weightKg
    val reps = repsBySlot[exercise.slotId] ?: done.lastOrNull()?.reps ?: exercise.reps
    var status by remember { mutableStateOf<String?>(null) }

    ScalingLazyColumn(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
        item { Text(exercise.name, textAlign = TextAlign.Center, fontWeight = FontWeight.Bold) }
        item {
            Text(
                "SERIE ${minOf(done.size + 1, max(exercise.targetSets, done.size + 1))}/${max(exercise.targetSets, done.size)}",
                color = Accent,
                fontSize = 12.sp,
            )
        }
        item {
            Stepper(
                value = formatWeight(weight, snapshot.weightUnit),
                label = "peso",
                onMinus = { weights[exercise.slotId] = max(0.0, weight - exercise.stepKg) },
                onPlus = { weights[exercise.slotId] = weight + exercise.stepKg },
            )
        }
        item {
            Stepper(
                value = "$reps reps",
                label = "repeticiones",
                onMinus = { repsBySlot[exercise.slotId] = max(1, reps - 1) },
                onPlus = { repsBySlot[exercise.slotId] = minOf(100, reps + 1) },
            )
        }
        item {
            Chip(
                modifier = Modifier.fillMaxWidth(),
                label = { Text("CONFIRMAR SERIE") },
                onClick = {
                    if (repository.logSet(exercise.slotId, (weight * 100).roundToInt() / 100.0, reps)) {
                        status = null
                        onLogged()
                    }
                },
                colors = ChipDefaults.chipColors(backgroundColor = Accent, contentColor = Color.Black),
            )
        }
        item {
            Chip(
                modifier = Modifier.fillMaxWidth(),
                label = { Text("DESHACER") },
                onClick = { status = if (repository.undoLast(exercise.slotId)) null else "No hay una serie tuya para deshacer" },
                colors = ChipDefaults.secondaryChipColors(),
            )
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CompactButton(
                    onClick = { if (index > 0) { index -= 1; repository.selectExercise(index) } },
                    enabled = index > 0,
                    colors = ButtonDefaults.secondaryButtonColors(),
                    modifier = Modifier.semantics { contentDescription = "Ejercicio anterior" },
                ) { Text("‹") }
                CompactButton(
                    onClick = { if (index < snapshot.exercises.lastIndex) { index += 1; repository.selectExercise(index) } },
                    enabled = index < snapshot.exercises.lastIndex,
                    colors = ButtonDefaults.secondaryButtonColors(),
                    modifier = Modifier.semantics { contentDescription = "Ejercicio siguiente" },
                ) { Text("›") }
            }
        }
        item {
            // Queued ≠ saved: only the phone's confirmation counts as saved.
            val line = status
                ?: lastRejection
                ?: when {
                    queued > 0 && !connected -> "$queued en cola · sin conexión"
                    queued > 0 -> "$queued enviando…"
                    else -> "Guardado en el teléfono"
                }
            Text(line, fontSize = 11.sp, textAlign = TextAlign.Center, color = MaterialTheme.colors.onSurfaceVariant)
        }
    }
}

@Composable
private fun Stepper(value: String, label: String, onMinus: () -> Unit, onPlus: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        CompactButton(onClick = onMinus, colors = ButtonDefaults.secondaryButtonColors(), modifier = Modifier.semantics { contentDescription = "Menos $label" }) { Text("−") }
        Text(value, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        CompactButton(onClick = onPlus, colors = ButtonDefaults.secondaryButtonColors(), modifier = Modifier.semantics { contentDescription = "Más $label" }) { Text("+") }
    }
}
