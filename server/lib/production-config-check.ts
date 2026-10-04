/**
 * Launch-safety checks on the production environment, logged once at server
 * start. They never stop the server — a missing optional integration must not
 * take the API down — but each finding names a setting that would be unsafe or
 * silently broken for real users. Values are never printed, only names.
 */
export interface ConfigFinding {
  setting: string;
  problem: string;
}

export function productionConfigFindings(env: Record<string, string | undefined>): ConfigFinding[] {
  if (env.NODE_ENV !== "production") return [];
  const findings: ConfigFinding[] = [];

  if (env.ALLOW_SANDBOX_ENTITLEMENTS === "true") {
    findings.push({ setting: "ALLOW_SANDBOX_ENTITLEMENTS", problem: "sandbox and Test Store purchases unlock Plus for free; remove it before launch" });
  }
  if (env.REVENUECAT_API_KEY && !env.REVENUECAT_WEBHOOK_SECRET) {
    findings.push({ setting: "REVENUECAT_WEBHOOK_SECRET", problem: "RevenueCat is configured but webhooks cannot be authenticated" });
  }
  if (env.REVENUECAT_API_KEY?.startsWith("test_") || env.REVENUECAT_API_KEY?.startsWith("sk_test")) {
    findings.push({ setting: "REVENUECAT_API_KEY", problem: "a test key is configured in production" });
  }
  if (!env.SENTRY_DSN) {
    findings.push({ setting: "SENTRY_DSN", problem: "server errors are not reported" });
  }
  if (env.BETTER_AUTH_URL && !env.BETTER_AUTH_URL.startsWith("https://")) {
    findings.push({ setting: "BETTER_AUTH_URL", problem: "auth callbacks are not served over HTTPS" });
  }
  return findings;
}
