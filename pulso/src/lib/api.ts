// Authenticated fetch against the PULSO server (non-auth endpoints).

import { getAuthHeaders, SERVER_URL } from './auth-client';

export class ApiError extends Error {
  status: number;
  code: string | null;

  constructor(status: number, code?: string | null) {
    super(code ?? `http_${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code ?? null;
  }
}

export async function apiFetch<T>(path: string, options?: {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  signal?: AbortSignal;
  /** Optional captured auth headers for requests that must survive local logout cleanup. */
  headers?: Record<string, string>;
}): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: options?.method ?? 'GET',
    signal: options?.signal,
    headers: {
      ...getAuthHeaders(),
      ...options?.headers,
      ...(options?.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    let code: string | null = null;
    try {
      code = ((await res.json()) as { error?: string }).error ?? null;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, code);
  }
  return (await res.json()) as T;
}
