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

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = process.env.APP_VARIANT === 'production' ? VARIANTS.production : VARIANTS.development;
  return {
    ...config,
    name: variant.name,
    slug: config.slug ?? 'pulso',
    scheme: variant.scheme,
    ios: { ...config.ios, bundleIdentifier: variant.id },
    android: { ...config.android, package: variant.id },
  };
};
