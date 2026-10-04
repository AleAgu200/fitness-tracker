import Foundation

/// Commands issued on the watch, persisted until the iPhone answers. Offline,
/// they wait here and are resent; the iPhone applies each command ID once and
/// answers repeats from its own record, so resending is always safe.
final class CommandQueue {
  struct Entry: Codable, Equatable {
    var command: Command
    /// queued (not confirmed yet), saved, rejected
    var status: String
    var reason: String?
    var setId: String?
    var attempts: Int
    var resolvedAt: Int64?
  }

  private let defaults: UserDefaults
  private let queueKey = "pulso_watch_commands"
  private let seqKey = "pulso_watch_seq"
  private static let maxResolved = 50

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  func all() -> [Entry] { load() }

  func nextSeq() -> Int64 {
    let next = Int64(defaults.integer(forKey: seqKey)) + 1
    defaults.set(Int(next), forKey: seqKey)
    return next
  }

  func enqueue(_ command: Command) {
    var entries = load()
    guard !entries.contains(where: { $0.command.commandId == command.commandId }) else { return }
    entries.append(Entry(command: command, status: "queued", reason: nil, setId: nil, attempts: 0, resolvedAt: nil))
    save(entries)
  }

  /// Commands still waiting for the iPhone, oldest first; expired ones are not resent.
  func pending(now: Int64) -> [Entry] {
    load().filter { $0.status == "queued" && $0.command.expiresAt > now }
  }

  func markSent(_ commandId: String) {
    save(load().map { entry in
      var copy = entry
      if entry.command.commandId == commandId { copy.attempts += 1 }
      return copy
    })
  }

  /// Applies the iPhone's answer; true when something changed. Later repeats are ignored.
  @discardableResult
  func apply(_ result: CommandResult, now: Int64 = nowMs()) -> Bool {
    var changed = false
    let updated = load().map { entry -> Entry in
      guard entry.command.commandId == result.commandId, entry.status == "queued" else { return entry }
      changed = true
      var copy = entry
      copy.status = result.status
      copy.reason = result.reason
      copy.setId = result.setId
      copy.resolvedAt = now
      return copy
    }
    if changed { save(updated) }
    return changed
  }

  /// Forgets a set that never left the watch. False when it may have been
  /// delivered: then an undo command has to be sent instead.
  func withdrawUnsent(_ commandId: String) -> Bool {
    let entries = load()
    guard let entry = entries.first(where: { $0.command.commandId == commandId }),
          entry.status == "queued", entry.attempts == 0 else { return false }
    save(entries.filter { $0.command.commandId != commandId })
    return true
  }

  /// After a sign-out or account switch, nothing of the previous account stays on the watch.
  @discardableResult
  func keepOnly(account accountKey: String?) -> Int {
    let entries = load()
    let kept = accountKey == nil ? [] : entries.filter { $0.command.accountKey == accountKey }
    if kept.count != entries.count { save(kept) }
    return entries.count - kept.count
  }

  func prune() {
    let entries = load()
    let resolved = entries.filter { $0.status != "queued" }
    guard resolved.count > Self.maxResolved else { return }
    let drop = Set(resolved.sorted { ($0.resolvedAt ?? 0) < ($1.resolvedAt ?? 0) }
      .prefix(resolved.count - Self.maxResolved)
      .map { $0.command.commandId })
    save(entries.filter { !drop.contains($0.command.commandId) })
  }

  private func load() -> [Entry] {
    guard let data = defaults.data(forKey: queueKey) else { return [] }
    return (try? JSONDecoder().decode([Entry].self, from: data)) ?? []
  }

  private func save(_ entries: [Entry]) {
    if let data = try? JSONEncoder().encode(entries) { defaults.set(data, forKey: queueKey) }
  }
}

/// What the watch shows per exercise: the iPhone's confirmed sets plus the ones
/// still on their way (queued, or confirmed after this snapshot), minus sets
/// whose undo is on its way.
func displaySets(snapshot: Snapshot, entries: [CommandQueue.Entry]) -> [String: [WatchSet]] {
  var result = Dictionary(uniqueKeysWithValues: snapshot.exercises.map { ($0.slotId, $0.sets) })
  let inFlight = entries
    .filter { entry in
      entry.command.accountKey == snapshot.accountKey &&
        entry.command.sessionKey == snapshot.sessionKey &&
        (entry.status == "queued" || (entry.status == "saved" && Double(entry.resolvedAt ?? 0) > snapshot.publishedAt))
    }
    .sorted { ($0.command.issuedAt, $0.command.seq) < ($1.command.issuedAt, $1.command.seq) }
  for entry in inFlight {
    let command = entry.command
    switch command.type {
    case "log_set":
      if let slot = command.slotId, result[slot] != nil {
        result[slot]?.append(WatchSet(weightKg: command.weightKg ?? 0, reps: command.reps ?? 0))
      }
    case "undo_set":
      if let target = entries.first(where: { $0.command.commandId == command.targetCommandId })?.command,
         let slot = target.slotId, let sets = result[slot], !sets.isEmpty {
        result[slot]?.removeLast()
      }
    default:
      break
    }
  }
  return result
}
