/**
 * Google or Apple sign-in joins the PULSO account with the same address. The
 * provider has just proven who owns that address; a password on an account
 * whose address was never confirmed has not. Someone could have registered
 * the athlete's address first, so that password can't survive the join: it is
 * removed, along with every open session, and the athlete can set a new one
 * through "¿Olvidaste tu contraseña?".
 *
 * An explicit link from Perfil (the owner already signed in to that account)
 * keeps the password: the person who knows it is the one linking.
 */
export function passwordMustGoOnLink(input: {
  providerId: string;
  emailVerified: boolean;
  linkedBySignedInOwner: boolean;
}): boolean {
  if (input.providerId === "credential") return false;
  return !input.emailVerified && !input.linkedBySignedInOwner;
}
