import * as Sentry from "@sentry/nextjs";

export async function register() {
  // Background jobs need Node APIs and the database; never run them on the edge.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    const { productionConfigFindings } = await import("./lib/production-config-check");
    for (const finding of productionConfigFindings(process.env)) {
      console.warn(`[config] ${finding.setting}: ${finding.problem}`);
    }
    const { startAccountPurgeScheduler } = await import("./lib/account-purge-scheduler");
    startAccountPurgeScheduler();
  }
}

// Unhandled errors in route handlers, server components and actions. A no-op
// when Sentry was not initialized (no SENTRY_DSN).
export const onRequestError = Sentry.captureRequestError;
