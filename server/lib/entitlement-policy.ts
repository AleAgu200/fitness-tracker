/**
 * Entitlement rules that need no database, so they can be unit tested without a
 * live PostgreSQL — the same split as permissions-policy.ts.
 */

/** How long a stored snapshot is trusted before RevenueCat may be asked again. */
export const REVERIFY_COOLDOWN_MS = 60_000;

/**
 * Whether a stored subscription should be re-read from RevenueCat before
 * refusing paid work: it was set to renew, its period has ended, and no
 * renewal reached us. A late or missing webhook must not make a paying
 * athlete buy again; a snapshot refreshed under a minute ago is trusted, so a
 * lapsed subscription doesn't call RevenueCat on every request.
 */
export function shouldReverifyEntitlement(
  row: { status: string; willRenew: boolean; currentPeriodEndsAt: number | null; updatedAt: number },
  now = Date.now(),
): boolean {
  const renewable = row.status === "active" || row.status === "in_grace_period" || row.status === "billing_issue";
  const lapsed = row.currentPeriodEndsAt != null && row.currentPeriodEndsAt <= now;
  return renewable && row.willRenew && lapsed && now - row.updatedAt > REVERIFY_COOLDOWN_MS;
}

/**
 * Whether a sandbox receipt may unlock paid features.
 *
 * Sandbox and RevenueCat Test Store purchases cost nothing, so honouring them
 * in production would hand out the subscription for free. They are refused by
 * default. The opt-in exists because the Test Store is the only way to exercise
 * the purchase flow against a real deployment before store products are live —
 * without it a test purchase is recorded and then silently ignored, which looks
 * exactly like a broken integration.
 */
export function sandboxEntitlementAllowed(
  isSandbox: boolean,
  env: { NODE_ENV?: string; ALLOW_SANDBOX_ENTITLEMENTS?: string } = process.env,
): boolean {
  if (!isSandbox) return true;
  if (env.NODE_ENV !== "production") return true;
  return env.ALLOW_SANDBOX_ENTITLEMENTS === "true";
}
