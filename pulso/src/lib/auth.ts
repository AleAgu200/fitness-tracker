// Auth actions — thin wrappers around the Better Auth client.
// All network calls go to the Next.js server at EXPO_PUBLIC_SERVER_URL.

import { authClient, clearStoredCookie, restoreCookieFromStorage } from "./auth-client";
import { AUTH_ERROR_MESSAGES, AuthErrorKind, classifyAuthError } from "./auth-errors";

/** Error with the HTTP status and Better Auth error code attached */
export class AuthError extends Error {
  status: number;
  code: string | null;
  kind: AuthErrorKind;
  /** Spanish, ready to show; empty when nothing should be shown (a cancel). */
  userMessage: string;

  constructor(message: string, status: number, code?: string | null, kind?: AuthErrorKind) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = code ?? null;
    this.kind = kind ?? classifyAuthError({ status, code, message });
    this.userMessage = AUTH_ERROR_MESSAGES[this.kind];
  }
}

export function isUserExistsError(e: unknown): boolean {
  return e instanceof AuthError && e.kind === "user_exists";
}

type BetterAuthError = { status: number; message?: string; code?: string } | null;

/**
 * Runs a Better Auth call and turns both kinds of failure into an AuthError:
 * an error response (with its code) and a request that never got an answer.
 */
async function call<T>(fallback: string, request: () => Promise<{ data: T; error: BetterAuthError }>): Promise<T> {
  let result: { data: T; error: BetterAuthError };
  try {
    result = await request();
  } catch (e) {
    throw new AuthError(e instanceof Error ? e.message : "network_error", 0, null);
  }
  const { data, error } = result;
  if (error) throw new AuthError(error.message ?? fallback, error.status ?? 0, error.code);
  return data;
}

/** Where the server sends links from verification emails (see server/app/cuenta). */
const VERIFIED_PATH = "/cuenta/verificado";
const RESET_PATH = "/cuenta/restablecer";

export async function signUp(email: string, password: string, name?: string) {
  return call("signup_failed", () => authClient.signUp.email({
    email: email.trim().toLowerCase(),
    password,
    name: name ?? email.split("@")[0],
    callbackURL: VERIFIED_PATH,
  }));
}

export async function signIn(email: string, password: string) {
  return call("invalid_credentials", () => authClient.signIn.email({
    email: email.trim().toLowerCase(),
    password,
  }));
}

/**
 * Signs in (or signs up) with an ID token obtained natively from Google or
 * Apple. The server verifies the token; an existing PULSO account with the
 * same address is never joined implicitly.
 */
export async function signInWithIdToken(
  provider: "google" | "apple",
  token: { idToken: string; nonce?: string; user?: { name?: { firstName?: string; lastName?: string }; email?: string } },
) {
  return call("social_failed", () => authClient.signIn.social({
    provider,
    idToken: { token: token.idToken, nonce: token.nonce, user: token.user },
    // Athletes may create their account this way; the portal never does
    // (server/lib/auth-providers.ts).
    requestSignUp: true,
  }));
}

/**
 * Asks for a recovery link. The answer is the same whether or not the address
 * has an account, so it can't be used to find out who uses PULSO.
 */
export async function requestPasswordReset(email: string) {
  return call("reset_failed", () => authClient.requestPasswordReset({
    email: email.trim().toLowerCase(),
    redirectTo: RESET_PATH,
  }));
}

export async function resendVerificationEmail(email: string) {
  return call("verification_failed", () => authClient.sendVerificationEmail({
    email: email.trim().toLowerCase(),
    callbackURL: VERIFIED_PATH,
  }));
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
