import * as Sentry from "@sentry/nextjs";

import { scrubServerEvent, type ServerCrashEvent } from "./lib/crash-scrub";

/**
 * Server error reporting. SENTRY_DSN comes from Doppler; without it nothing is
 * initialized. No PII, no performance traces, no request bodies: every event
 * passes the allowlist in lib/crash-scrub.ts.
 */
const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  try {
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      maxBreadcrumbs: 30,
      // Sentry's event types are wider than the fields the scrubber reads.
      beforeSend: event => scrubServerEvent(event as unknown as ServerCrashEvent) as unknown as typeof event,
    });
  } catch (error) {
    // Reporting must never stop the server from starting.
    console.error("[sentry] init failed", error);
  }
}
