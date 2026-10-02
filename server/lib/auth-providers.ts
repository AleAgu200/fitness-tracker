/**
 * Social sign-in providers, enabled only when their identifiers are set.
 *
 * The app signs in natively and sends the provider's ID token; the server only
 * verifies it, so no client secret is needed for this flow.
 *
 * - GOOGLE_CLIENT_IDS: comma-separated audiences an ID token may carry. The
 *   Web client ID comes first (it is the audience of tokens obtained on
 *   Android and, with a server client ID, on iOS); the iOS client ID may follow.
 *   The Android client is never an audience: it only authorizes package + SHA-1.
 * - APPLE_BUNDLE_IDS: comma-separated bundle identifiers (dev and production
 *   variants); Apple's ID token audience is the app's bundle ID.
 */

export function parseList(value: string | undefined): string[] {
  return (value ?? "").split(",").map(item => item.trim()).filter(Boolean);
}

export interface SocialProviderConfig {
  google?: { clientId: string[]; clientSecret: string };
  apple?: { clientId: string; clientSecret: string; audience: string[] };
}

/**
 * Either provider signs in or creates the account, in the app and the portal.
 * A new account starts as an athlete; the portal then finishes the
 * professional setup (discipline, organization, code) with PUT /api/portal/signup.
 */
export function socialProvidersFromEnv(env: Record<string, string | undefined>): SocialProviderConfig {
  const providers: SocialProviderConfig = {};
  const googleIds = parseList(env.GOOGLE_CLIENT_IDS);
  if (googleIds.length) {
    // The secret is used by the portal's browser redirect; the app's ID-token
    // sign-in works without it.
    providers.google = { clientId: googleIds, clientSecret: env.GOOGLE_CLIENT_SECRET ?? "" };
  }
  const appleIds = parseList(env.APPLE_BUNDLE_IDS);
  if (appleIds.length) {
    providers.apple = { clientId: appleIds[0], clientSecret: env.APPLE_CLIENT_SECRET ?? "", audience: appleIds };
  }
  return providers;
}

/** Google in a browser (the portal) needs the secret for the code exchange. */
export function googleWebSignInEnabled(env: Record<string, string | undefined>): boolean {
  return parseList(env.GOOGLE_CLIENT_IDS).length > 0 && Boolean(env.GOOGLE_CLIENT_SECRET);
}
