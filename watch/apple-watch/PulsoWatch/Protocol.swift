import Foundation

// Mirror of pulso/src/lib/watch/protocol.ts (and the Wear OS Protocol.kt).
// The phone owns the plan and the history; the watch sends commands and
// shows what the phone confirmed.

enum WatchProtocol {
  static let version = 1
  /// A command older than this is refused by the phone rather than logged into a later day.
  static let commandTTLms: Int64 = 12 * 60 * 60 * 1000
  static let restDefaultSeconds: TimeInterval = 90
}

/// Milliseconds since 1970, the unit every timestamp on the wire uses.
func nowMs() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }

struct WatchSet: Codable, Equatable {
  var weightKg: Double
  var reps: Int
}

struct WatchExercise: Codable, Equatable, Identifiable {
  var slotId: String
  var name: String
  var targetSets: Int
  var reps: Int
  var weightKg: Double
  var stepKg: Double
  var sets: [WatchSet]
  var id: String { slotId }
}

struct CommandResult: Codable, Equatable {
  var commandId: String
  var status: String
  var reason: String?
  var setId: String?

  static func parse(_ json: String) -> CommandResult? {
    guard let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(CommandResult.self, from: data)
  }
}

struct RestState: Codable, Equatable {
  var endAt: Double?
  var total: Int
}

struct Snapshot: Codable, Equatable {
  var v: Int
  /// Nil when the phone is signed out: everything account-scoped is cleared.
  var accountKey: String?
  var sessionKey: String?
  var revision: Double
  var publishedAt: Double
  var sessionDone: Bool
  var weightUnit: String
  var currentIndex: Int
  var exercises: [WatchExercise]
  var rest: RestState
  var results: [CommandResult]

  static func parse(_ json: String) -> Snapshot? {
    guard let data = json.data(using: .utf8),
          let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data),
          snapshot.v == WatchProtocol.version else { return nil }
    return snapshot
  }
}

struct Command: Codable, Equatable {
  var v: Int = WatchProtocol.version
  var commandId: String
  var type: String
  var accountKey: String
  var sessionKey: String
  var seq: Int64
  var baseRevision: Double
  var issuedAt: Int64
  var expiresAt: Int64
  var slotId: String? = nil
  var weightKg: Double? = nil
  var reps: Int? = nil
  var targetCommandId: String? = nil
  var index: Int? = nil
  var seconds: Int? = nil

  /// Optional fields that are nil are left out (encodeIfPresent), as the phone expects.
  func json() -> String? {
    guard let data = try? JSONEncoder().encode(self) else { return nil }
    return String(data: data, encoding: .utf8)
  }

  /// 24 URL-safe characters: matches the phone's ID rule.
  static func newId() -> String {
    "i" + String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(23))
  }
}

/// What the athlete reads when the phone refuses a command.
func reasonText(_ reason: String?) -> String {
  switch reason {
  case "wrong_account": return "Es de otra cuenta"
  case "stale_session": return "Era de otra sesión"
  case "session_ended": return "La sesión ya terminó"
  case "expired": return "Venció sin llegar al iPhone"
  case "unknown_exercise": return "Ese ejercicio ya no está en el plan"
  case "conflict": return "Se registró otra serie después: corregilo en el iPhone"
  case "already_synced": return "Ya se sincronizó: corregilo en el iPhone"
  case "not_found": return "No se encontró la serie"
  default: return "El iPhone no lo aceptó"
  }
}

func formatWeight(_ kg: Double, unit: String) -> String {
  let value = unit == "lb" ? kg * 2.2046226218 : kg
  let text = value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(format: "%.1f", value)
  return "\(text) \(unit)"
}
