import Foundation
import WatchConnectivity

/// The watch's view of the iPhone: the latest snapshot (application context,
/// so it is there even after being offline) and the local command queue.
/// Commands go out as queued user info (the system delivers it later if the
/// iPhone is away) and, when reachable, as a message for speed. Anything not
/// answered is resent every 15 s; the iPhone answers repeats from its record.
@MainActor
final class WatchStore: NSObject, ObservableObject {
  @Published private(set) var snapshot: Snapshot?
  @Published private(set) var entries: [CommandQueue.Entry] = []
  @Published private(set) var phoneReachable = false
  /// Set when a sign-out or account switch discarded unsent actions.
  @Published var notice: String?

  private let queue = CommandQueue()
  private var resendTimer: Timer?

  override init() {
    super.init()
    entries = queue.all()
    if WCSession.isSupported() {
      WCSession.default.delegate = self
      WCSession.default.activate()
    }
  }

  func start() {
    resendTimer?.invalidate()
    resendTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
      Task { @MainActor in self?.flush() }
    }
    flush()
  }

  func stop() {
    resendTimer?.invalidate()
    resendTimer = nil
  }

  // MARK: incoming

  fileprivate func handleState(_ json: String) {
    guard let next = Snapshot.parse(json) else { return }
    if let current = snapshot, next.revision < current.revision { return }
    let dropped = queue.keepOnly(account: next.accountKey)
    if dropped > 0 { notice = "Cambió la cuenta en el iPhone: se descartaron \(dropped) acciones sin enviar." }
    for result in next.results { queue.apply(result) }
    queue.prune()
    snapshot = next
    entries = queue.all()
  }

  fileprivate func handleAck(_ json: String) {
    guard let result = CommandResult.parse(json) else { return }
    if queue.apply(result) { entries = queue.all() }
  }

  fileprivate func setReachable(_ reachable: Bool) {
    phoneReachable = reachable
    if reachable { flush() }
  }

  // MARK: outgoing

  func flush() {
    let session = WCSession.default
    guard WCSession.isSupported(), session.activationState == .activated else { return }
    for entry in queue.pending(now: nowMs()) {
      guard let json = entry.command.json() else { continue }
      if entry.attempts == 0 {
        // Guaranteed delivery, even if the iPhone is off right now.
        session.transferUserInfo(["command": json])
        queue.markSent(entry.command.commandId)
      } else if session.isReachable {
        session.sendMessage(["command": json], replyHandler: nil, errorHandler: nil)
        queue.markSent(entry.command.commandId)
      }
    }
    entries = queue.all()
  }

  private func issue(_ build: (_ account: String, _ session: String, _ now: Int64, _ seq: Int64, _ revision: Double) -> Command) -> Bool {
    guard let current = snapshot, let account = current.accountKey, let session = current.sessionKey else { return false }
    queue.enqueue(build(account, session, nowMs(), queue.nextSeq(), current.revision))
    entries = queue.all()
    flush()
    return true
  }

  @discardableResult
  func logSet(slotId: String, weightKg: Double, reps: Int) -> Bool {
    issue { account, session, now, seq, revision in
      Command(commandId: Command.newId(), type: "log_set", accountKey: account, sessionKey: session, seq: seq,
              baseRevision: revision, issuedAt: now, expiresAt: now + WatchProtocol.commandTTLms,
              slotId: slotId, weightKg: (weightKg * 100).rounded() / 100, reps: reps)
    }
  }

  /// Undoes this watch's last set on an exercise: forgotten if never sent, otherwise an undo command.
  @discardableResult
  func undoLast(slotId: String) -> Bool {
    let all = queue.all()
    let target = all.last { entry in
      entry.command.type == "log_set" && entry.command.slotId == slotId && entry.status != "rejected" &&
        !all.contains { $0.command.type == "undo_set" && $0.command.targetCommandId == entry.command.commandId && $0.status != "rejected" }
    }
    guard let target else { return false }
    if queue.withdrawUnsent(target.command.commandId) {
      entries = queue.all()
      return true
    }
    return issue { account, session, now, seq, revision in
      Command(commandId: Command.newId(), type: "undo_set", accountKey: account, sessionKey: session, seq: seq,
              baseRevision: revision, issuedAt: now, expiresAt: now + WatchProtocol.commandTTLms,
              targetCommandId: target.command.commandId)
    }
  }

  @discardableResult
  func selectExercise(_ index: Int) -> Bool {
    issue { account, session, now, seq, revision in
      Command(commandId: Command.newId(), type: "select_exercise", accountKey: account, sessionKey: session, seq: seq,
              baseRevision: revision, issuedAt: now, expiresAt: now + WatchProtocol.commandTTLms, index: index)
    }
  }

  @discardableResult
  func skipRest() -> Bool {
    issue { account, session, now, seq, revision in
      Command(commandId: Command.newId(), type: "skip_rest", accountKey: account, sessionKey: session, seq: seq,
              baseRevision: revision, issuedAt: now, expiresAt: now + WatchProtocol.commandTTLms)
    }
  }
}

// Delegate callbacks arrive off the main actor: extract plain strings first,
// then hop to the main actor with them.
extension WatchStore: WCSessionDelegate {
  nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    let state = session.receivedApplicationContext["state"] as? String
    let reachable = session.isReachable
    Task { @MainActor in
      if let state { self.handleState(state) }
      self.setReachable(reachable)
    }
  }

  nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    guard let state = applicationContext["state"] as? String else { return }
    Task { @MainActor in self.handleState(state) }
  }

  nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    guard let ack = userInfo["ack"] as? String else { return }
    Task { @MainActor in self.handleAck(ack) }
  }

  nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    guard let ack = message["ack"] as? String else { return }
    Task { @MainActor in self.handleAck(ack) }
  }

  nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
    let reachable = session.isReachable
    Task { @MainActor in self.setReachable(reachable) }
  }
}
