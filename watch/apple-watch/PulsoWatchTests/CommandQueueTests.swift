import XCTest
@testable import PulsoWatch

/// Same cases as the Wear OS CommandQueueTest, so both watches behave alike.
final class CommandQueueTests: XCTestCase {
  private var defaults: UserDefaults!

  override func setUp() {
    super.setUp()
    defaults = UserDefaults(suiteName: "pulso-watch-tests-\(UUID().uuidString)")
  }

  private func log(_ id: String, account: String = "acct", issuedAt: Int64 = 1_000, expiresAt: Int64 = .max) -> Command {
    Command(commandId: id, type: "log_set", accountKey: account, sessionKey: "2026-10-04:tpl", seq: 1, baseRevision: 1,
            issuedAt: issuedAt, expiresAt: expiresAt, slotId: "slot1", weightKg: 60, reps: 8)
  }

  func testCommandsSurviveAndEncodeWithoutNilFields() throws {
    CommandQueue(defaults: defaults).enqueue(log("i0000000001"))
    let reloaded = CommandQueue(defaults: defaults).all()
    XCTAssertEqual(reloaded.count, 1)
    let json = try XCTUnwrap(reloaded[0].command.json())
    XCTAssertFalse(json.contains("targetCommandId"))
    XCTAssertTrue(json.contains("\"v\":1"))
  }

  func testPendingSkipsExpiredAndAnswered() {
    let queue = CommandQueue(defaults: defaults)
    queue.enqueue(log("i0000000001"))
    queue.enqueue(log("i0000000002", expiresAt: 500))
    queue.enqueue(log("i0000000003"))
    queue.apply(CommandResult(commandId: "i0000000003", status: "saved", reason: nil, setId: "set3"))
    XCTAssertEqual(queue.pending(now: 1_000).map(\.command.commandId), ["i0000000001"])
  }

  func testAResultIsAppliedOnce() {
    let queue = CommandQueue(defaults: defaults)
    queue.enqueue(log("i0000000001"))
    XCTAssertTrue(queue.apply(CommandResult(commandId: "i0000000001", status: "saved", reason: nil, setId: "s1"), now: 10))
    XCTAssertFalse(queue.apply(CommandResult(commandId: "i0000000001", status: "rejected", reason: "expired", setId: nil), now: 20))
    XCTAssertEqual(queue.all()[0].status, "saved")
  }

  func testAnUnsentSetIsWithdrawnButASentOneIsNot() {
    let queue = CommandQueue(defaults: defaults)
    queue.enqueue(log("i0000000001"))
    queue.enqueue(log("i0000000002"))
    queue.markSent("i0000000002")
    XCTAssertTrue(queue.withdrawUnsent("i0000000001"))
    XCTAssertFalse(queue.withdrawUnsent("i0000000002"))
  }

  func testAccountSwitchAndSignOutClearTheOtherAccount() {
    let queue = CommandQueue(defaults: defaults)
    queue.enqueue(log("i0000000001", account: "a"))
    queue.enqueue(log("i0000000002", account: "b"))
    XCTAssertEqual(queue.keepOnly(account: "b"), 1)
    XCTAssertEqual(queue.keepOnly(account: nil), 1)
    XCTAssertTrue(queue.all().isEmpty)
  }

  func testDisplayAddsInFlightSetsAndRemovesUndoneOnes() {
    let snapshot = Snapshot(v: 1, accountKey: "acct", sessionKey: "2026-10-04:tpl", revision: 5, publishedAt: 100,
                            sessionDone: false, weightUnit: "kg", currentIndex: 0,
                            exercises: [WatchExercise(slotId: "slot1", name: "Sentadilla", targetSets: 4, reps: 8, weightKg: 60, stepKg: 2.5, sets: [WatchSet(weightKg: 60, reps: 8)])],
                            rest: RestState(endAt: nil, total: 90), results: [])
    let queue = CommandQueue(defaults: defaults)
    queue.enqueue(log("i0000000001", issuedAt: 200))
    XCTAssertEqual(displaySets(snapshot: snapshot, entries: queue.all())["slot1"]?.count, 2)
    queue.enqueue(Command(commandId: "i0000000002", type: "undo_set", accountKey: "acct", sessionKey: "2026-10-04:tpl", seq: 2,
                          baseRevision: 5, issuedAt: 400, expiresAt: .max, targetCommandId: "i0000000001"))
    XCTAssertEqual(displaySets(snapshot: snapshot, entries: queue.all())["slot1"]?.count, 1)
  }

  func testSnapshotParsesSignedOutState() {
    let json = #"{"v":1,"accountKey":null,"sessionKey":null,"revision":1,"publishedAt":1,"sessionDone":false,"weightUnit":"kg","currentIndex":0,"exercises":[],"rest":{"endAt":null,"total":0},"results":[]}"#
    XCTAssertNil(Snapshot.parse(json)?.accountKey)
    XCTAssertNotNil(Snapshot.parse(json))
    XCTAssertNil(Snapshot.parse(#"{"v":2}"#))
  }

  func testIdsMatchThePhoneRule() {
    let id = Command.newId()
    XCTAssertNotNil(id.range(of: "^[A-Za-z0-9_-]{8,64}$", options: .regularExpression))
  }
}
