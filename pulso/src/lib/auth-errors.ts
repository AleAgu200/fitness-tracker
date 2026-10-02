/**
 * One place that turns an auth failure into something the athlete can act on.
 * Pure (tests/auth-errors.test.ts): classification uses Better Auth's stable
 * error codes first, and the HTTP status only when there is no code — a 422
 * alone does not mean "the account exists".
 */

export type AuthErrorKind =
  | 'invalid_credentials'
  | 'email_not_verified'
  | 'user_exists'
  | 'weak_password'
  | 'invalid_email'
  | 'rate_limited'
  | 'offline'
  | 'temporary'
  | 'feature_unavailable'
  | 'social_cancelled'
  | 'social_invalid'
  | 'account_not_linked'
  | 'account_suspended'
  | 'link_expired'
  | 'unknown';

export interface AuthFailure {
  /** 0 = the request never got an answer (no connection, server down). */
  status?: number | null;
  code?: string | null;
  message?: string | null;
}

const BY_CODE: Record<string, AuthErrorKind> = {
  INVALID_EMAIL_OR_PASSWORD: 'invalid_credentials',
  INVALID_PASSWORD: 'invalid_credentials',
  CREDENTIAL_ACCOUNT_NOT_FOUND: 'invalid_credentials',
  EMAIL_NOT_VERIFIED: 'email_not_verified',
  USER_ALREADY_EXISTS: 'user_exists',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'user_exists',
  PASSWORD_TOO_SHORT: 'weak_password',
  PASSWORD_TOO_LONG: 'weak_password',
  INVALID_EMAIL: 'invalid_email',
  RESET_PASSWORD_DISABLED: 'feature_unavailable',
  VERIFICATION_EMAIL_NOT_ENABLED: 'feature_unavailable',
  PROVIDER_NOT_FOUND: 'feature_unavailable',
  ID_TOKEN_NOT_SUPPORTED: 'feature_unavailable',
  INVALID_TOKEN: 'social_invalid',
  USER_EMAIL_NOT_FOUND: 'social_invalid',
  FAILED_TO_GET_USER_INFO: 'social_invalid',
  ACCOUNT_SUSPENDED: 'account_suspended',
  MAGIC_LINK_INVALID: 'link_expired',
};

export function classifyAuthError(failure: AuthFailure): AuthErrorKind {
  const code = failure.code?.toUpperCase() ?? null;
  if (code === 'OAUTH_LINK_ERROR') {
    return /not linked/i.test(failure.message ?? '') ? 'account_not_linked' : 'temporary';
  }
  if (code && BY_CODE[code]) return BY_CODE[code];
  const status = failure.status ?? 0;
  if (status === 0) return 'offline';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'temporary';
  return 'unknown';
}

export const AUTH_ERROR_MESSAGES: Record<AuthErrorKind, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  email_not_verified: 'Confirmá tu correo antes de entrar. Revisá tu bandeja o pedí otro enlace.',
  user_exists: 'Ya hay una cuenta con ese correo. Iniciá sesión o recuperá tu contraseña.',
  weak_password: 'La contraseña debe tener entre 6 y 128 caracteres.',
  invalid_email: 'Ese correo no parece válido. Revisalo.',
  rate_limited: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.',
  offline: 'No hay conexión con PULSO. Revisá tu internet y probá de nuevo.',
  temporary: 'El servicio no respondió. Probá de nuevo en un momento.',
  feature_unavailable: 'Esta opción todavía no está disponible. Usá tu correo y contraseña.',
  social_cancelled: '',
  social_invalid: 'No pudimos confirmar tu cuenta con ese proveedor. Probá de nuevo.',
  account_not_linked: 'Ya existe una cuenta PULSO con ese correo. Entrá con tu correo y contraseña.',
  account_suspended: 'Tu cuenta está suspendida. Respondé el correo que te enviamos para saber más.',
  link_expired: 'El enlace venció o ya se usó. Pedí uno nuevo.',
  unknown: 'No pudimos completar la acción. Probá de nuevo.',
};

export function authErrorMessage(failure: AuthFailure): string {
  return AUTH_ERROR_MESSAGES[classifyAuthError(failure)];
}
