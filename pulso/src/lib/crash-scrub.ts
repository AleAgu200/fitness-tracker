/**
 * Privacy filter for crash reports. Pure on purpose (no React Native, no
 * Sentry import) so it runs under `node --test`.
 *
 * Allowlist, not blocklist: a report keeps only what diagnoses a crash —
 * exception type, scrubbed message, stack frames, device/OS/app context,
 * allowlisted tags and breadcrumbs. Everything else is dropped: user,
 * request bodies, headers, cookies, query strings, `extra`, frame variables
 * and any context this file does not name. Health values, meals, plans and
 * photos never reach a report because no field that could carry them survives.
 */

/** The subset of a Sentry event this filter reads or writes. */
export interface CrashEvent {
  message?: string;
  exception?: { values?: CrashException[] };
  breadcrumbs?: CrashBreadcrumb[];
  request?: { url?: string; method?: string; [key: string]: unknown };
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  user?: unknown;
  [key: string]: unknown;
}

export interface CrashException {
  type?: string;
  value?: string;
  stacktrace?: { frames?: { vars?: unknown; [key: string]: unknown }[] };
  [key: string]: unknown;
}

export interface CrashBreadcrumb {
  timestamp?: number;
  category?: string;
  type?: string;
  message?: string;
  level?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Device/runtime context: enough to reproduce, nothing about the athlete. */
const ALLOWED_CONTEXTS = new Set(['os', 'device', 'app', 'runtime', 'react_native_context', 'expo', 'trace']);

/** Fields of the device context that identify hardware, not a person. */
const ALLOWED_DEVICE_FIELDS = new Set([
  'family', 'model', 'model_id', 'manufacturer', 'brand', 'arch', 'simulator',
  'memory_size', 'free_memory', 'low_memory', 'orientation', 'processor_count',
  'screen_density', 'screen_height_pixels', 'screen_width_pixels',
]);

/** Tags we set ourselves plus the SDK's environment/release tags. */
const ALLOWED_TAGS = new Set([
  'platform', 'build', 'variant', 'environment', 'release', 'dist',
  'error_code', 'area', 'event.origin', 'event.environment', 'handled', 'mechanism', 'level', 'os.name',
]);

/**
 * Breadcrumb categories worth keeping. `console` is dropped (logs can echo
 * any value); `fetch`/`xhr` keep method, status and a query-free path.
 * `pulso.*` are ours and must already carry codes, never payloads.
 */
const HTTP_CATEGORIES = new Set(['fetch', 'xhr', 'http']);
const KEPT_CATEGORIES = new Set(['navigation', 'app.lifecycle', 'app.state', 'device.orientation', 'sentry.event', 'sentry.transaction']);

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER = /\bbearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;
// Session tokens, API keys, hex digests: any long unbroken run of key-like characters.
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;
const QUERY = /(https?:\/\/[^\s?#"']+|\/[^\s?#"']*)\?[^\s#"']*/g;

/** Remove anything credential- or identity-shaped from free text. */
export function scrubText(text: string): string {
  return text
    .replace(BEARER, 'Bearer [redacted]')
    .replace(JWT, '[redacted-token]')
    .replace(EMAIL, '[redacted-email]')
    .replace(QUERY, '$1')
    .replace(LONG_TOKEN, '[redacted-token]');
}

/** Path of a URL without its query string or fragment; never the full URL with parameters. */
export function scrubUrl(url: string): string {
  const withoutQuery = url.split(/[?#]/, 1)[0] ?? '';
  return scrubText(withoutQuery);
}

function pick(source: Record<string, unknown>, keys: Set<string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (keys.has(key)) result[key] = value;
  }
  return result;
}

function scrubContexts(contexts: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!contexts) return undefined;
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(contexts)) {
    if (!ALLOWED_CONTEXTS.has(name) || typeof value !== 'object' || value === null) continue;
    result[name] = name === 'device' ? pick(value as Record<string, unknown>, ALLOWED_DEVICE_FIELDS) : value;
  }
  return result;
}

function scrubTags(tags: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!tags) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (ALLOWED_TAGS.has(key)) result[key] = typeof value === 'string' ? scrubText(value) : value;
  }
  return result;
}

/** Keep a breadcrumb only in a shape that cannot carry personal data, or drop it (null). */
export function scrubBreadcrumb(crumb: CrashBreadcrumb): CrashBreadcrumb | null {
  const category = crumb.category ?? '';
  const base: CrashBreadcrumb = {};
  if (crumb.timestamp !== undefined) base.timestamp = crumb.timestamp;
  if (crumb.level !== undefined) base.level = crumb.level;
  if (crumb.type !== undefined) base.type = crumb.type;
  if (crumb.category !== undefined) base.category = crumb.category;

  if (HTTP_CATEGORIES.has(category)) {
    const data = crumb.data ?? {};
    const kept: Record<string, unknown> = {};
    if (typeof data.method === 'string') kept.method = data.method;
    if (typeof data.status_code === 'number') kept.status_code = data.status_code;
    if (typeof data.url === 'string') kept.url = scrubUrl(data.url);
    return { ...base, data: kept };
  }

  if (category === 'navigation') {
    const data = crumb.data ?? {};
    const kept: Record<string, unknown> = {};
    // Route paths can embed IDs as segments; strip queries and token-shaped segments.
    if (typeof data.from === 'string') kept.from = scrubUrl(data.from);
    if (typeof data.to === 'string') kept.to = scrubUrl(data.to);
    return { ...base, data: kept };
  }

  if (category.startsWith('pulso.')) {
    // Our own breadcrumbs: a message that is a code, plus an optional code field.
    const code = crumb.data?.code;
    return {
      ...base,
      ...(crumb.message ? { message: scrubText(crumb.message) } : {}),
      ...(typeof code === 'string' ? { data: { code: scrubText(code) } } : {}),
    };
  }

  if (KEPT_CATEGORIES.has(category)) {
    return { ...base, ...(crumb.message ? { message: scrubText(crumb.message) } : {}) };
  }

  return null;
}

/** Apply the allowlist to a whole event. Returns a new object; the input is not mutated. */
export function scrubEvent<E extends CrashEvent>(event: E): E {
  const result: CrashEvent = { ...event };

  delete result.user;
  delete result.extra;
  delete result.server_name;

  if (typeof result.message === 'string') result.message = scrubText(result.message);
  // logentry carries the unformatted message and its params, which may be values.
  if (result.logentry && typeof result.logentry === 'object') {
    const message = (result.logentry as { message?: unknown }).message;
    result.logentry = typeof message === 'string' ? { message: scrubText(message) } : undefined;
  }

  if (result.exception?.values) {
    result.exception = {
      ...result.exception,
      values: result.exception.values.map(exception => ({
        ...exception,
        ...(typeof exception.value === 'string' ? { value: scrubText(exception.value) } : {}),
        ...(exception.stacktrace?.frames
          ? {
            stacktrace: {
              ...exception.stacktrace,
              frames: exception.stacktrace.frames.map(({ vars: _vars, ...frame }) => frame),
            },
          }
          : {}),
      })),
    };
  }

  if (result.request) {
    result.request = {
      ...(typeof result.request.method === 'string' ? { method: result.request.method } : {}),
      ...(typeof result.request.url === 'string' ? { url: scrubUrl(result.request.url) } : {}),
    };
  }

  result.contexts = scrubContexts(result.contexts);
  result.tags = scrubTags(result.tags);

  if (result.breadcrumbs) {
    result.breadcrumbs = result.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((crumb): crumb is CrashBreadcrumb => crumb !== null);
  }

  return result as E;
}
