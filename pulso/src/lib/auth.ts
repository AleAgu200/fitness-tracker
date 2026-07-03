// Auth actions — thin wrappers around the Better Auth client.
// All network calls go to the Next.js server at EXPO_PUBLIC_SERVER_URL.

import { authClient, clearStoredCookie, restoreCookieFromStorage } from "./auth-client";

export async function signUp(email: string, password: string, name?: string) {
  const { data, error } = await authClient.signUp.email({
    email: email.trim().toLowerCase(),
    password,
    name: name ?? email.split("@")[0],
  });
  if (error) throw new Error(error.message ?? "signup_failed");
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await authClient.signIn.email({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw new Error(error.message ?? "invalid_credentials");
  return data;
}

export async function getActiveSession() {
  await restoreCookieFromStorage();
  const { data } = await authClient.getSession();
  if (!data?.session) return null;
  return { userId: data.user.id, sessionId: data.session.id };
}

export async function signOut() {
  await authClient.signOut();
  await clearStoredCookie();
}
