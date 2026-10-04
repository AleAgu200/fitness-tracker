import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Two installable variants of the same app, chosen by APP_VARIANT (set per
 * build profile in eas.json):
 *
 * - production: the identifier published to App Store and Google Play. It can
 *   never change after the first release.
 * - development (default, also preview and local runs): the identifier the
 *   development Google OAuth client was created for.
 *
 * Distinct identifiers, name and scheme let both be installed side by side,
 * and keep OAuth redirects, purchases and widgets of one from reaching the other.
 */
const VARIANTS = {
  production: { id: 'com.pulsofitness.pulsofitness', name: 'PULSO', scheme: 'pulso' },
  development: { id: 'com.lalomaster.pulso', name: 'PULSO Dev', scheme: 'pulso-dev' },
} as const;

/**
 * Google Sign-In needs its URL scheme (the reversed iOS client ID) on iOS
 * only; Android works from the package + SHA-1 registered in Google Cloud.
 * Without an iOS client the plugin is left out and the app hides the button.
 */
function googleSignInPlugin(): [string, { iosUrlScheme: string }] | null {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  if (!iosClientId) return null;
  const prefix = iosClientId.replace(/\.apps\.googleusercontent\.com$/, '');
  return ['@react-native-google-signin/google-signin', { iosUrlScheme: `com.googleusercontent.apps.${prefix}` }];
}

/**
 * Sentry's plugin adds a release build step that uploads source maps and
 * native debug symbols, and that step fails without an auth token. So it is
 * added only when SENTRY_AUTH_TOKEN exists — an EAS environment variable with
 * "secret" visibility, never a file in this repo. Without it the build still
 * reports crashes (the native SDK is autolinked); stack traces stay minified.
 */
function sentryPlugin(): [string, { organization: string; project: string; url: string }] | null {
  if (!process.env.SENTRY_AUTH_TOKEN) return null;
  return ['@sentry/react-native/expo', { organization: 'pulsofitness', project: 'react-native', url: 'https://sentry.io/' }];
}

/**
 * Health Connect (Android) and Apple Health (iOS), all optional for the
 * athlete. Every permission declared here must match real use: the Play
 * Console health declaration and Apple's review check these lists.
 */
const HEALTH_CONNECT_PERMISSIONS = [
  'android.permission.health.READ_STEPS',
  'android.permission.health.READ_WEIGHT',
  'android.permission.health.READ_SLEEP',
  'android.permission.health.READ_HEART_RATE',
  'android.permission.health.WRITE_EXERCISE',
];

const HEALTH_PLUGINS: ExpoConfig['plugins'] = [
  'react-native-health-connect',
  // Health Connect needs Android 8.0+ (API 26).
  ['expo-build-properties', { android: { minSdkVersion: 26 } }],
  ['@kingstinct/react-native-healthkit', {
    NSHealthShareUsageDescription: 'PULSO lee tus pasos, peso, sueño y frecuencia cardíaca de Salud solo si lo activás, para mostrarlos junto a tu entreno. No se comparten con tu coach ni se usan para publicidad.',
    NSHealthUpdateUsageDescription: 'PULSO guarda en Salud los entrenos que completás, solo si lo activás.',
    background: false,
  }],
];

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = process.env.APP_VARIANT === 'production' ? VARIANTS.production : VARIANTS.development;
  const google = googleSignInPlugin();
  const sentry = sentryPlugin();
  return {
    ...config,
    name: variant.name,
    slug: config.slug ?? 'pulso',
    scheme: variant.scheme,
    ios: { ...config.ios, bundleIdentifier: variant.id, usesAppleSignIn: true },
    android: {
      ...config.android,
      package: variant.id,
      permissions: [...(config.android?.permissions ?? []), ...HEALTH_CONNECT_PERMISSIONS],
    },
    plugins: [
      ...(config.plugins ?? []),
      ...(HEALTH_PLUGINS ?? []),
      'expo-apple-authentication',
      ...(google ? [google] : []),
      ...(sentry ? [sentry] : []),
    ],
    extra: {
      ...config.extra,
      // Read by crash-reporting.ts to tag environment and variant.
      appVariant: process.env.APP_VARIANT === 'production' ? 'production' : 'development',
      buildProfile: process.env.EAS_BUILD_PROFILE ?? 'local',
    },
  };
};
