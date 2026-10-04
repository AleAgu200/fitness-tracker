// Watch target for @bacons/apple-targets (see watch/README.md). NOT enabled:
// the Swift sources have not been compiled yet, and enabling the plugin adds
// this target to every iOS build. Move this folder to pulso/targets/watch and
// add the plugin only after the target builds and runs in Xcode.

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = () => ({
  type: 'watch',
  name: 'PulsoWatch',
  // Appended to the iPhone app's bundle ID: com.lalomaster.pulso.watchkitapp in dev.
  bundleIdentifier: '.watchkitapp',
  deploymentTarget: '10.0',
  frameworks: ['WatchConnectivity', 'SwiftUI'],
});
