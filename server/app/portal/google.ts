import { api } from "./lib";

/**
 * Google in the portal. Signing in only works for a professional who already
 * linked Google from Perfil: the portal never creates accounts this way, and
 * an address that merely matches is never joined on its own.
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
  account_not_linked: "Esa cuenta de Google no está vinculada a PULSO. Ingresá con tu correo y contraseña y vinculala desde Perfil.",
  signup_disabled: "No hay una cuenta profesional con ese Google. Ingresá con tu correo y vinculala desde Perfil, o creá tu cuenta profesional.",
  "email_doesn't_match": "Esa cuenta de Google usa otro correo. Vinculá la que tenga el mismo correo que tu cuenta PULSO.",
  account_already_linked_to_different_user: "Esa cuenta de Google ya está vinculada a otro usuario de PULSO.",
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
  return MESSAGES[error] ?? "No se pudo completar el acceso con Google. Probá de nuevo.";
}
