/**
 * Magic links for the mobile app. A link in an email can't reliably open
 * `pulso://` (Gmail and others strip custom schemes), so the email points to
 * /cuenta/abrir-app on the server, which forwards the one-time token to the
 * app; the app redeems it itself and keeps the session (pulso/src/lib/auth.ts).
 */

/** URL schemes the app registers per build variant (pulso/app.config.ts). */
export const APP_SCHEMES = ["pulso", "pulso-dev"] as const;
export type AppScheme = typeof APP_SCHEMES[number];

export function isAppClient(metadata: Record<string, unknown> | undefined | null): boolean {
  return metadata?.client === "app";
}

export function appScheme(metadata: Record<string, unknown> | undefined | null): AppScheme {
  const scheme = metadata?.scheme;
  return APP_SCHEMES.includes(scheme as AppScheme) ? scheme as AppScheme : "pulso";
}

function serverBaseUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function appMagicLinkUrl(token: string, metadata: Record<string, unknown> | undefined | null): string {
  const params = new URLSearchParams({ token, scheme: appScheme(metadata) });
  return `${serverBaseUrl()}/cuenta/abrir-app?${params.toString()}`;
}

/** The deep link the hand-off page opens. */
export function appDeepLink(scheme: AppScheme, token: string): string {
  return `${scheme}://auth/magic?token=${encodeURIComponent(token)}`;
}
