import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import type { ComponentType } from 'react';
import { Platform } from 'react-native';

import { scrubBreadcrumb, scrubEvent, type CrashBreadcrumb, type CrashEvent } from './crash-scrub';

/**
 * Release crash reporting (Sentry). The DSN is public by design — it only
 * lets a client *send* events — so it ships in pulso/.env. Without it the
 * SDK is never initialized and the app runs exactly as before.
 *
 * Privacy: no PII, no screenshots, no view hierarchy, no session replay, no
 * performance traces; every event and breadcrumb passes the allowlist in
 * crash-scrub.ts. Release and dist come from the native app version, which is
 * what the build's source-map/symbol upload is tagged with.
 */
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() ?? '';

let enabled = false;

function buildInfo() {
  const extra = Constants.expoConfig?.extra as { appVariant?: string; buildProfile?: string } | undefined;
  return {
    variant: extra?.appVariant ?? 'development',
    buildProfile: extra?.buildProfile ?? 'local',
  };
}

/** Call once, as early as possible (module scope of the root layout). Never throws. */
export function initCrashReporting(): void {
  if (enabled || DSN === '') return;
  try {
    const { variant, buildProfile } = buildInfo();
    Sentry.init({
      dsn: DSN,
      environment: __DEV__ ? 'development' : buildProfile,
      sendDefaultPii: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      tracesSampleRate: 0,
      maxBreadcrumbs: 40,
      // Development errors are seen in the console; only builds report.
      enabled: !__DEV__,
      // Sentry's event types are wider than the fields the scrubber reads.
      beforeSend: event => scrubEvent(event as unknown as CrashEvent) as unknown as typeof event,
      beforeBreadcrumb: crumb => scrubBreadcrumb(crumb as unknown as CrashBreadcrumb) as unknown as typeof crumb | null,
    });
    Sentry.setTag('platform', Platform.OS);
    Sentry.setTag('variant', variant);
    enabled = true;
  } catch (error) {
    // Reporting must never be the reason the app does not start.
    console.warn('[crash-reporting] init failed', error);
  }
}

/** Wraps the root component when reporting is on; otherwise returns it unchanged. */
export function wrapRoot<P extends Record<string, unknown>>(component: ComponentType<P>): ComponentType<P> {
  return enabled ? Sentry.wrap(component) : component;
}

/**
 * Record a handled failure by code. `area` groups it (recovery, billing,
 * health…); `code` must be a stable error code, never a payload.
 */
export function reportHandledError(area: string, code: string, error?: unknown): void {
  if (!enabled) return;
  Sentry.withScope(scope => {
    scope.setTag('area', area);
    scope.setTag('error_code', code);
    Sentry.captureException(error instanceof Error ? error : new Error(`${area}:${code}`));
  });
}

/** A breadcrumb that carries only a code; the scrubber drops anything else. */
export function recordStep(area: string, code: string): void {
  if (!enabled) return;
  Sentry.addBreadcrumb({ category: `pulso.${area}`, message: code, level: 'info' });
}

export function crashReportingEnabled(): boolean {
  return enabled;
}

/** Diagnostics only: a JS error with a fixed, non-sensitive message. */
export function sendTestError(): void {
  if (!enabled) return;
  Sentry.captureException(new Error('PULSO diagnostic test error'));
}

/** Diagnostics only: crash the native layer to verify native symbolication. */
export function triggerNativeTestCrash(): void {
  if (!enabled) return;
  Sentry.nativeCrash();
}
