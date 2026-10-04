/**
 * Privacy filter for server error reports (Sentry). Allowlist: an event keeps
 * the exception, its stack (without local variables), the route path, method
 * and runtime context. Request bodies, headers, cookies, query strings, user,
 * `extra` and console/log breadcrumbs are dropped — they can carry session
 * tokens, emails, health values or plan payloads.
 */

export interface ServerCrashEvent {
  message?: string;
  exception?: { values?: { value?: string; stacktrace?: { frames?: { vars?: unknown; [key: string]: unknown }[] }; [key: string]: unknown }[] };
  breadcrumbs?: { category?: string; message?: string; data?: Record<string, unknown>; [key: string]: unknown }[];
  request?: { url?: string; method?: string; [key: string]: unknown };
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  [key: string]: unknown;
}

const ALLOWED_CONTEXTS = new Set(["os", "runtime", "app", "cloud_resource", "trace", "nextjs"]);
const ALLOWED_TAGS = new Set(["runtime", "environment", "release", "routeType", "routePath", "error_code", "area", "transaction", "level", "handled", "mechanism"]);

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER = /\bbearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;
const QUERY = /(https?:\/\/[^\s?#"']+|\/[^\s?#"']*)\?[^\s#"']*/g;
// Postgres errors quote the failing row: "Failing row contains (...)" / "Key (email)=(x) already exists".
const PG_DETAIL = /(Failing row contains|Key \([^)]*\)=)\s*\([^)]*\)/g;

export function scrubServerText(text: string): string {
  return text
    .replace(PG_DETAIL, "$1 ([redacted])")
    .replace(BEARER, "Bearer [redacted]")
    .replace(JWT, "[redacted-token]")
    .replace(EMAIL, "[redacted-email]")
    .replace(QUERY, "$1")
    .replace(LONG_TOKEN, "[redacted-token]");
}

function scrubPath(url: string): string {
  return scrubServerText(url.split(/[?#]/, 1)[0] ?? "");
}

export function scrubServerEvent<E extends ServerCrashEvent>(event: E): E {
  const result: ServerCrashEvent = { ...event };
  delete result.user;
  delete result.extra;
  delete result.server_name;
  delete result.modules;

  if (typeof result.message === "string") result.message = scrubServerText(result.message);
  if (result.logentry && typeof result.logentry === "object") {
    const message = (result.logentry as { message?: unknown }).message;
    result.logentry = typeof message === "string" ? { message: scrubServerText(message) } : undefined;
  }

  if (result.exception?.values) {
    result.exception = {
      ...result.exception,
      values: result.exception.values.map(exception => ({
        ...exception,
        ...(typeof exception.value === "string" ? { value: scrubServerText(exception.value) } : {}),
        ...(exception.stacktrace?.frames
          ? { stacktrace: { ...exception.stacktrace, frames: exception.stacktrace.frames.map(({ vars: _vars, ...frame }) => frame) } }
          : {}),
      })),
    };
  }

  if (result.request) {
    result.request = {
      ...(typeof result.request.method === "string" ? { method: result.request.method } : {}),
      ...(typeof result.request.url === "string" ? { url: scrubPath(result.request.url) } : {}),
    };
  }

  if (result.contexts) {
    result.contexts = Object.fromEntries(Object.entries(result.contexts).filter(([name]) => ALLOWED_CONTEXTS.has(name)));
  }
  if (result.tags) {
    result.tags = Object.fromEntries(Object.entries(result.tags).filter(([name]) => ALLOWED_TAGS.has(name)));
  }

  if (result.breadcrumbs) {
    result.breadcrumbs = result.breadcrumbs.flatMap(crumb => {
      const category = crumb.category ?? "";
      if (category === "http" || category === "fetch") {
        const data = crumb.data ?? {};
        return [{
          category,
          ...(crumb.timestamp !== undefined ? { timestamp: crumb.timestamp } : {}),
          data: {
            ...(typeof data.method === "string" ? { method: data.method } : {}),
            ...(typeof data.status_code === "number" ? { status_code: data.status_code } : {}),
            ...(typeof data.url === "string" ? { url: scrubPath(data.url) } : {}),
          },
        }];
      }
      // console, query and everything else can echo values; drop them.
      return [];
    });
  }

  return result as E;
}
