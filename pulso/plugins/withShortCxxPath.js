const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Windows only: this project's absolute path is deep enough that the C++ codegen
 * object files for autolinked native modules (react-native-safe-area-context,
 * react-native-screens, react-native-svg) exceed the 260-character MAX_PATH limit
 * under the default `android/app/.cxx` build staging directory, since CMake mirrors
 * the full absolute source path inside it. Redirecting the staging directory to a
 * short, project-root-adjacent path keeps the mirrored path under the limit.
 */
module.exports = function withShortCxxPath(config) {
  return withAppBuildGradle(config, config => {
    if (config.modResults.language !== 'groovy') return config;
    if (config.modResults.contents.includes('buildStagingDirectory')) return config;

    config.modResults.contents = config.modResults.contents.replace(
      /^android \{/m,
      'android {\n    externalNativeBuild {\n        cmake {\n            buildStagingDirectory "C:/rncxx/pulso"\n        }\n    }\n',
    );
    return config;
  });
};
