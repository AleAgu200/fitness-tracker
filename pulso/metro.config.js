// Sentry's Expo config wraps expo/metro-config's defaults and adds the debug
// IDs that tie each bundle to its uploaded source map.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// Allow Metro to resolve and bundle .sql migration files from drizzle-kit
config.resolver.sourceExts.push('sql');

module.exports = config;
