import ExpoModulesCore
import WatchConnectivity

/// Phone side of the Apple Watch companion. State goes out as the application
/// context (the watch always gets the latest); commands arrive as queued user
/// info (delivered even after being offline) or as messages when reachable.
public class PulsoWatchModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PulsoWatch")

    Events("onCommand")

    OnCreate {
      PulsoWatchSession.shared.module = self
      PulsoWatchSession.shared.activate()
    }

    OnDestroy {
      PulsoWatchSession.shared.module = nil
    }

    AsyncFunction("publishState") { (json: String) -> Bool in
      try PulsoWatchSession.shared.publish(json)
    }

    AsyncFunction("sendAck") { (json: String) -> Int in
      PulsoWatchSession.shared.sendAck(json)
    }

    Function("takePendingCommands") { () -> [String] in
      PulsoWatchSession.shared.drain()
    }

    AsyncFunction("isPaired") { () -> Bool in
      PulsoWatchSession.shared.isPaired
    }
  }

  func notifyPending() {
    sendEvent("onCommand", ["pending": true])
  }
}

final class PulsoWatchSession: NSObject, WCSessionDelegate {
  static let shared = PulsoWatchSession()

  weak var module: PulsoWatchModule?
  private let lock = NSLock()
  private let queueKey = "pulso_watch_queue"

  var isPaired: Bool {
    WCSession.isSupported() && WCSession.default.isPaired && WCSession.default.isWatchAppInstalled
  }

  func activate() {
    guard WCSession.isSupported() else { return }
    WCSession.default.delegate = self
    if WCSession.default.activationState != .activated { WCSession.default.activate() }
  }

  func publish(_ json: String) throws -> Bool {
    let session = WCSession.default
    guard WCSession.isSupported(), session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else {
      return false
    }
    try session.updateApplicationContext(["state": json])
    return true
  }

  func sendAck(_ json: String) -> Int {
    let session = WCSession.default
    guard WCSession.isSupported(), session.activationState == .activated, session.isWatchAppInstalled else { return 0 }
    if session.isReachable {
      session.sendMessage(["ack": json], replyHandler: nil) { _ in
        session.transferUserInfo(["ack": json])
      }
    } else {
      session.transferUserInfo(["ack": json])
    }
    return 1
  }

  /// Commands wait here until the app's JS drains them; the watch resends anything unacknowledged.
  func drain() -> [String] {
    lock.lock(); defer { lock.unlock() }
    let queue = UserDefaults.standard.stringArray(forKey: queueKey) ?? []
    UserDefaults.standard.set([String](), forKey: queueKey)
    return queue
  }

  private func enqueue(_ json: String) {
    lock.lock()
    var queue = UserDefaults.standard.stringArray(forKey: queueKey) ?? []
    if !queue.contains(json) { queue.append(json) }
    if queue.count > 500 { queue.removeFirst(queue.count - 500) }
    UserDefaults.standard.set(queue, forKey: queueKey)
    lock.unlock()
    DispatchQueue.main.async { self.module?.notifyPending() }
  }

  private func receive(_ payload: [String: Any]) {
    if let json = payload["command"] as? String { enqueue(json) }
  }

  // MARK: WCSessionDelegate

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { session.activate() }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) { receive(userInfo) }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { receive(message) }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
    receive(message)
    replyHandler(["queued": true])
  }
}
