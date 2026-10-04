# PULSO watch companions

Log sets from the wrist. The phone owns the plan and the history; a watch queues commands (also offline) and the phone applies each one exactly once, then acknowledges it.

| | Wear OS | Apple Watch |
|---|---|---|
| Source | `watch/wear-os/` (Kotlin, Compose for Wear OS) | `watch/apple-watch/` (SwiftUI) |
| Talks to the phone through | Wear OS Data Layer (data item + messages) | WatchConnectivity (application context + user info / messages) |
| Phone side | `pulso/modules/pulso-watch` (Android) | `pulso/modules/pulso-watch` (iOS) |
| Minimum | Wear OS 3 (API 30), paired Android phone | watchOS 10, paired iPhone (iOS 16.4+) |
| Compiled | Yes: `assembleDevDebug` / `assembleProdDebug`, 9 unit tests pass | **Not yet** (needs Xcode on a Mac) |
| Tested on a device | No | No |
| Crash reports | Sentry, if `pulsoSentryDsn` is set | Sentry, if the package is linked and `PulsoSentryDSN` is in Info.plist |
| Standalone (no phone) | No | No |

## What the first release does

Active session, previous/next exercise, weight and reps, confirm set, undo, rest timer (skip). No health sensors and no watch-only accounts (follow-on scope). Writing workouts to Health Connect / Apple Health stays on the phone (plan G4), so a workout is never written twice.

## Protocol (shared)

Defined once in `pulso/src/lib/watch/protocol.ts` and mirrored in `Protocol.kt` / `Protocol.swift`.

- **Snapshot** (phone → watch): pseudonymous `accountKey` (a hash, never the user ID or a token), `sessionKey` (`date:templateId`), revision, exercises with their sets, rest deadline, and the latest command results.
- **Command** (watch → phone): `commandId`, `type` (`log_set`, `undo_set`, `select_exercise`, `start_rest`, `skip_rest`), account and session keys, per-watch `seq`, `baseRevision`, `issuedAt`, `expiresAt` (≤ 12 h).
- The phone stores every result in `watch_commands` **in the same transaction** as the set, so a command delivered twice is answered from that record instead of logging twice.
- Refused with a reason the watch shows: other account, stale or ended session, expired, unknown exercise, undo conflict (another set was logged after it), undo of a set already synced to the server.
- **Queued ≠ saved**: the watch shows "en cola" until the phone confirms.
- On sign-out or account switch the phone publishes a signed-out snapshot and the watch discards the previous account's unsent actions (and says so).

## Wear OS

The Data Layer only connects apps with the **same application ID and signing key** as the phone app. Flavors: `dev` = `com.lalomaster.pulso`, `prod` = `com.pulsofitness.pulsofitness`.

```bash
cd watch/wear-os
./gradlew :app:testDevDebugUnitTest      # protocol and queue tests
./gradlew :app:assembleDevDebug          # APK for a dev phone build
```

To pair with an EAS-built phone app, sign the watch APK with the **same keystore** (download it with `eas credentials`). For Play, the watch app is uploaded as a Wear OS form-factor release in the same Play listing.

Emulator: create a Wear OS emulator, pair it with a phone emulator using the Wear OS app on the phone, install the phone dev build and the watch APK.

## Apple Watch

Needs a Mac with Xcode 16+.

Fastest way to try it:
1. `cd pulso && npx expo prebuild -p ios` and open `ios/*.xcworkspace`.
2. File → New → Target → watchOS → App, name **PulsoWatch**, bundle ID `<iPhone bundle ID>.watchkitapp`.
3. Replace the generated Swift files with `watch/apple-watch/PulsoWatch/*.swift` (add `PulsoWatchTests/` as the test target).
4. Run the **PulsoWatch** scheme on a paired iPhone + Apple Watch simulator. Run the tests with ⌘U.

To build it with EAS later: install `@bacons/apple-targets`, move `watch/apple-watch` to `pulso/targets/watch` (it already has `expo-target.config.js`), and add the plugin to `app.config.ts`. Do this **only after** the target builds in Xcode: the plugin adds it to every iOS build.

## Acceptance (from the plan, on real devices)

- Log, undo and reconnect after offline use; restart the watch; the phone stores **one** set per confirm.
- Repeated delivery and out-of-order acknowledgements change nothing.
- Account switch on the phone clears the watch; a command for an ended session or another account is refused.
- Connectivity loss mid-session, accessibility (VoiceOver / TalkBack labels), rest timer.
