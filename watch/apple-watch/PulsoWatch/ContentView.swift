import SwiftUI

private let accent = Color(red: 0.24, green: 0.86, blue: 1.0)

struct ContentView: View {
  @EnvironmentObject private var store: WatchStore
  /// Rest started on the watch shows at once, before the iPhone's snapshot arrives.
  @State private var localRestEnd = Date.distantPast

  var body: some View {
    TimelineView(.periodic(from: .now, by: 1)) { context in
      screen(now: context.date)
    }
  }

  @ViewBuilder
  private func screen(now: Date) -> some View {
    if let notice = store.notice {
      MessageView(text: notice, action: "OK") { store.notice = nil }
    } else if let snapshot = store.snapshot {
      if snapshot.accountKey == nil {
        MessageView(text: "Iniciá sesión en PULSO en tu iPhone.")
      } else if snapshot.sessionKey == nil || snapshot.exercises.isEmpty {
        MessageView(text: "Hoy no hay entreno en tu plan.")
      } else if snapshot.sessionDone {
        MessageView(text: "Sesión completada. Buen trabajo.")
      } else {
        let phoneRestEnd = snapshot.rest.endAt.map { Date(timeIntervalSince1970: $0 / 1000) } ?? .distantPast
        let restEnd = max(phoneRestEnd, localRestEnd)
        if restEnd > now {
          RestView(secondsLeft: Int(restEnd.timeIntervalSince(now).rounded(.up))) {
            localRestEnd = .distantPast
            store.skipRest()
          }
        } else {
          ExerciseView(snapshot: snapshot) {
            localRestEnd = Date().addingTimeInterval(WatchProtocol.restDefaultSeconds)
          }
        }
      }
    } else {
      MessageView(text: "Abrí PULSO en tu iPhone para empezar.")
    }
  }
}

struct MessageView: View {
  let text: String
  var action: String? = nil
  var onAction: () -> Void = {}

  var body: some View {
    VStack(spacing: 10) {
      Text(text).multilineTextAlignment(.center)
      if let action { Button(action, action: onAction) }
    }
    .padding()
  }
}

struct RestView: View {
  let secondsLeft: Int
  let onSkip: () -> Void

  var body: some View {
    VStack(spacing: 8) {
      Text("DESCANSO").font(.caption2).foregroundStyle(accent)
      Text(String(format: "%d:%02d", secondsLeft / 60, secondsLeft % 60))
        .font(.system(size: 40, weight: .bold, design: .rounded))
        .monospacedDigit()
        .accessibilityLabel("\(secondsLeft) segundos de descanso")
      Button("SALTAR", action: onSkip)
    }
  }
}

struct ExerciseView: View {
  @EnvironmentObject private var store: WatchStore
  let snapshot: Snapshot
  let onLogged: () -> Void

  @State private var index: Int
  @State private var weights: [String: Double] = [:]
  @State private var repsBySlot: [String: Int] = [:]
  @State private var status: String?

  init(snapshot: Snapshot, onLogged: @escaping () -> Void) {
    self.snapshot = snapshot
    self.onLogged = onLogged
    _index = State(initialValue: min(max(snapshot.currentIndex, 0), max(snapshot.exercises.count - 1, 0)))
  }

  var body: some View {
    let exercise = snapshot.exercises[min(index, snapshot.exercises.count - 1)]
    let done = displaySets(snapshot: snapshot, entries: store.entries)[exercise.slotId] ?? []
    // Steppers start from the last set of this exercise, else from the plan.
    let weight = weights[exercise.slotId] ?? done.last?.weightKg ?? exercise.weightKg
    let reps = repsBySlot[exercise.slotId] ?? done.last?.reps ?? exercise.reps
    let total = max(exercise.targetSets, done.count)

    ScrollView {
      VStack(spacing: 8) {
        Text(exercise.name).font(.headline).multilineTextAlignment(.center)
        Text("SERIE \(min(done.count + 1, max(total, done.count + 1)))/\(total)").font(.caption2).foregroundStyle(accent)

        stepper(value: formatWeight(weight, unit: snapshot.weightUnit), label: "peso",
                minus: { weights[exercise.slotId] = max(0, weight - exercise.stepKg) },
                plus: { weights[exercise.slotId] = weight + exercise.stepKg })
        stepper(value: "\(reps) reps", label: "repeticiones",
                minus: { repsBySlot[exercise.slotId] = max(1, reps - 1) },
                plus: { repsBySlot[exercise.slotId] = min(100, reps + 1) })

        Button {
          if store.logSet(slotId: exercise.slotId, weightKg: weight, reps: reps) {
            status = nil
            onLogged()
          }
        } label: {
          Text("CONFIRMAR SERIE").frame(maxWidth: .infinity)
        }
        .tint(accent)

        Button("DESHACER") {
          status = store.undoLast(slotId: exercise.slotId) ? nil : "No hay una serie tuya para deshacer"
        }

        HStack {
          Button("‹") { if index > 0 { index -= 1; store.selectExercise(index) } }
            .disabled(index == 0)
            .accessibilityLabel("Ejercicio anterior")
          Button("›") { if index < snapshot.exercises.count - 1 { index += 1; store.selectExercise(index) } }
            .disabled(index >= snapshot.exercises.count - 1)
            .accessibilityLabel("Ejercicio siguiente")
        }

        // Queued ≠ saved: only the iPhone's confirmation counts as saved.
        Text(statusLine).font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
      }
    }
  }

  private var statusLine: String {
    if let status { return status }
    if let rejected = store.entries.last(where: { $0.status == "rejected" }) { return reasonText(rejected.reason) }
    let queued = store.entries.filter { $0.status == "queued" }.count
    if queued > 0 { return store.phoneReachable ? "\(queued) enviando…" : "\(queued) en cola · sin conexión" }
    return "Guardado en el iPhone"
  }

  private func stepper(value: String, label: String, minus: @escaping () -> Void, plus: @escaping () -> Void) -> some View {
    HStack {
      Button("−", action: minus).accessibilityLabel("Menos \(label)")
      Text(value).font(.title3.bold()).monospacedDigit().frame(minWidth: 70)
      Button("+", action: plus).accessibilityLabel("Más \(label)")
    }
  }
}
