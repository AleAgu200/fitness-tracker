// Native Google and Apple sign-in. Each returns the provider's ID token for
// the server to verify (lib/auth.ts signInWithIdToken), or null when the
// athlete cancels.
//
// The native modules are imported lazily: a build made before they were added
// has no native side, and a static import would crash the login screen.

import { Platform } from "react-native";

import { AuthError } from "./auth";

/** Web client: the audience of the ID token the server verifies. */
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";
/** Needed on iOS only (with its URL scheme in app.config.ts). */
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";

export function googleSignInConfigured(): boolean {
  if (!GOOGLE_WEB_CLIENT_ID) return false;
  if (Platform.OS === "ios") return Boolean(GOOGLE_IOS_CLIENT_ID);
  return Platform.OS === "android";
}

function unavailable(reason: string): AuthError {
  return new AuthError(reason, 0, null, "feature_unavailable");
}

export interface ProviderToken {
  idToken: string;
  nonce?: string;
  user?: { name?: { firstName?: string; lastName?: string }; email?: string };
}

export async function getGoogleIdToken(): Promise<ProviderToken | null> {
  if (!googleSignInConfigured()) throw unavailable("google_not_configured");
  let google: typeof import("@react-native-google-signin/google-signin");
  try {
    google = await import("@react-native-google-signin/google-signin");
  } catch {
    throw unavailable("google_native_module_missing");
  }
  const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = google;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    ...(GOOGLE_IOS_CLIENT_ID ? { iosClientId: GOOGLE_IOS_CLIENT_ID } : {}),
  });
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null;
    const idToken = response.data.idToken;
    if (!idToken) throw new AuthError("google_no_id_token", 401, null, "social_invalid");
    return { idToken };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS) return null;
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw unavailable("play_services_missing");
    }
    // DEVELOPER_ERROR lands here: the build's SHA-1 or package doesn't match
    // an Android client in Google Cloud. Logged so it can be diagnosed.
    console.error("[google-sign-in]", e);
    throw new AuthError("google_failed", 401, null, "social_invalid");
  } finally {
    // PULSO keeps its own session; forgetting the Google one lets the account
    // picker appear next time, so switching accounts is possible.
    GoogleSignin.signOut().catch(() => {});
  }
}

export async function appleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    const apple = await import("expo-apple-authentication");
    return await apple.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function getAppleIdToken(): Promise<ProviderToken | null> {
  let apple: typeof import("expo-apple-authentication");
  let crypto: typeof import("expo-crypto");
  try {
    [apple, crypto] = await Promise.all([import("expo-apple-authentication"), import("expo-crypto")]);
  } catch {
    throw unavailable("apple_native_module_missing");
  }
  // The same nonce goes into Apple's token and to the server, which checks it.
  const nonce = crypto.randomUUID();
  try {
    const credential = await apple.signInAsync({
      requestedScopes: [apple.AppleAuthenticationScope.FULL_NAME, apple.AppleAuthenticationScope.EMAIL],
      nonce,
    });
    if (!credential.identityToken) throw new AuthError("apple_no_id_token", 401, null, "social_invalid");
    // Apple shares the name only the first time; pass it along while we have it.
    const name = credential.fullName?.givenName || credential.fullName?.familyName
      ? { firstName: credential.fullName?.givenName ?? undefined, lastName: credential.fullName?.familyName ?? undefined }
      : undefined;
    return { idToken: credential.identityToken, nonce, user: name ? { name, email: credential.email ?? undefined } : undefined };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    if ((e as { code?: string })?.code === "ERR_REQUEST_CANCELED") return null;
    console.error("[apple-sign-in]", e);
    throw new AuthError("apple_failed", 401, null, "social_invalid");
  }
}
