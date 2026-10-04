import SwiftUI
#if canImport(Sentry)
import Sentry
#endif

@main
struct PulsoWatchApp: App {
  @StateObject private var store = WatchStore()
  @Environment(\.scenePhase) private var scenePhase

  init() {
    CrashReporting.start()
  }

  var body: some Scene {
    WindowGroup {
      ContentView().environmentObject(store)
    }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active { store.start() } else { store.stop() }
    }
  }
}

/// Crash reporting for the watch, only when the Sentry package is linked and a
/// DSN is set in Info.plist (`PulsoSentryDSN`). No user, no breadcrumbs:
/// the watch shows weights and reps.
enum CrashReporting {
  static func start() {
    #if canImport(Sentry)
    guard let dsn = Bundle.main.object(forInfoDictionaryKey: "PulsoSentryDSN") as? String, !dsn.isEmpty else { return }
    SentrySDK.start { options in
      options.dsn = dsn
      options.sendDefaultPii = false
      options.beforeSend = { event in
        event.user = nil
        event.breadcrumbs = nil
        return event
      }
    }
    #endif
  }
}
