/**
 * Entitlement rules that need no database, so they can be unit tested without a
 * live PostgreSQL — the same split as permissions-policy.ts.
 */

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
