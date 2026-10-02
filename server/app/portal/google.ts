import { api } from "./lib";

/**
 * Google in the portal. It signs in the account with the same address, or
 * creates one; a new account then finishes its professional setup in the
 * portal (PUT /api/portal/signup).
 */

/** Sends the browser to Google; it comes back to `returnTo` (or with ?error=). */
export async function startGoogleSignIn(returnTo: string): Promise<void> {
  const { url } = await api<{ url: string }>("/api/auth/sign-in/social", {
    method: "POST",
    body: JSON.stringify({ provider: "google", callbackURL: returnTo, errorCallbackURL: returnTo, disableRedirect: true }),
  });
  window.location.assign(url);
}

/** Links Google to the signed-in professional, then comes back to `returnTo`. */
export async function startGoogleLink(returnTo: string): Promise<void> {
  const { url } = await api<{ url: string }>("/api/auth/link-social", {
    method: "POST",
    body: JSON.stringify({ provider: "google", callbackURL: `${returnTo}?google=vinculado`, errorCallbackURL: returnTo, disableRedirect: true }),
  });
  window.location.assign(url);
}

const MESSAGES: Record<string, string> = {
  account_not_linked: "No se pudo unir ese Google a tu cuenta PULSO. Ingresá con tu correo y contraseña y vinculalo desde Perfil.",
  "email_doesn't_match": "Esa cuenta de Google usa otro correo. Vinculá la que tenga el mismo correo que tu cuenta PULSO.",
  account_already_linked_to_different_user: "Esa cuenta de Google ya está vinculada a otro usuario de PULSO.",
  // Magic link round trips land here too.
  INVALID_TOKEN: "El enlace venció o ya se usó. Pedí uno nuevo.",
  new_user_signup_disabled: "No hay una cuenta con ese correo. Creá tu cuenta profesional primero.",
  ACCOUNT_SUSPENDED: "Tu cuenta está suspendida. Respondé el correo que te enviamos para más información.",
};

/**
 * Reads the `?error=` Better Auth leaves after a Google round trip and removes
 * it from the address bar. Null when there is nothing to say (none, or the
 * professional cancelled at Google).
 */
export function takeGoogleError(): string | null {
  const url = new URL(window.location.href);
  const error = url.searchParams.get("error");
  if (!error) return null;
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  if (error === "access_denied") return null;
  return MESSAGES[error] ?? "No se pudo completar el acceso. Probá de nuevo.";
}
