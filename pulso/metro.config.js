const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow Metro to resolve and bundle .sql migration files from drizzle-kit
config.resolver.sourceExts.push('sql');

module.exports = config;
