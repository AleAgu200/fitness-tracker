// Auth actions — thin wrappers around the Better Auth client.
// All network calls go to the Next.js server at EXPO_PUBLIC_SERVER_URL.

import { authClient, clearStoredCookie, restoreCookieFromStorage } from "./auth-client";

/** Error with the HTTP status and Better Auth error code attached */
export class AuthError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code?: string | null) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = code ?? null;
  }
}

export function isUserExistsError(e: unknown): boolean {
  return e instanceof AuthError && (e.status === 422 || e.code === "USER_ALREADY_EXISTS");
}

export async function signUp(email: string, password: string, name?: string) {
  const { data, error } = await authClient.signUp.email({
    email: email.trim().toLowerCase(),
    password,
    name: name ?? email.split("@")[0],
  });
  if (error) {
    throw new AuthError(error.message ?? "signup_failed", error.status, (error as { code?: string }).code);
  }
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await authClient.signIn.email({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) {
    throw new AuthError(error.message ?? "invalid_credentials", error.status, (error as { code?: string }).code);
  }
  return data;
}

export async function getActiveSession() {
  await restoreCookieFromStorage();
  const { data } = await authClient.getSession();
  if (!data?.session) return null;
  // isSuperAdmin is a Better Auth additionalField (server/lib/auth.ts) not declared
  // in this client's type config, so it comes through untyped on the raw response.
  const user = data.user as typeof data.user & { isSuperAdmin?: boolean };
  return { userId: user.id, sessionId: data.session.id, isSuperAdmin: user.isSuperAdmin ?? false };
}

export async function signOut() {
  // Start server revocation while the in-memory cookie is still available,
  // then clear the device session immediately so offline logout still works.
  try {
    const remoteSignOut = authClient.signOut();
    await clearStoredCookie();
    await remoteSignOut;
  } finally {
    // The response hook may observe Better Auth's expired Set-Cookie header.
    // Clear again so no empty or stale cookie is restored on next launch.
    await clearStoredCookie();
  }
}
