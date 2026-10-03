import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type PurchasesPackage } from 'react-native-purchases';

import { ApiError } from './api';

/**
 * RevenueCat wiring. Like the ads SDK, the native module is NOT available in
 * Expo Go — guard on `purchasesSupported` before touching anything that reaches
 * native, and treat a dead billing SDK as "not subscribed" rather than an error
 * that blocks the app.
 *
 * These are *public* SDK keys and belong in the client; the secret API key and
 * the webhook secret live on the server only.
 */
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';
const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';

/** Entitlement identifier configured in the RevenueCat dashboard. */
export const PULSO_PLUS = 'pulso_plus';

export const purchasesSupported =
  (Platform.OS === 'android' && ANDROID_KEY !== '') || (Platform.OS === 'ios' && IOS_KEY !== '');

/**
 * The server answers 402 `subscription_required` when paid work is refused.
 * Callers use this to show the paywall instead of a generic failure message.
 */
export function isPaywallError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 402;
}

let configuredFor: string | null = null;

/**
 * Identify the athlete to RevenueCat.
 *
 * The RevenueCat app user id is the PULSO user id: that is what lets the
 * server's webhook map a purchase back to an account. Anonymous purchases
 * arrive with an id the server cannot resolve.
 *
 * Signing out switches the SDK to an anonymous user, and calling configure()
 * again on the next sign-in does nothing — the athlete stayed anonymous, saw
 * the paywall for a subscription they had, and paid again under that
 * anonymous id. So configure() runs once and every later sign-in is a logIn(),
 * which also moves what the anonymous user bought to the account.
 */
export async function configurePurchases(userId: string): Promise<void> {
  if (!purchasesSupported || configuredFor === userId) return;
  try {
    // Asked of the SDK itself: a JS reload keeps the native SDK configured.
    if (!(await Purchases.isConfigured())) {
      if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
      Purchases.configure({
        apiKey: Platform.OS === 'android' ? ANDROID_KEY : IOS_KEY,
        appUserID: userId,
      });
    } else if ((await Purchases.getAppUserID()) !== userId) {
      await Purchases.logIn(userId);
    }
    configuredFor = userId;
  } catch (error) {
    console.warn('[purchases] configure failed', error);
  }
}

export async function logOutPurchases(): Promise<void> {
  if (!purchasesSupported || configuredFor === null) return;
  try {
    await Purchases.logOut();
  } catch {
    // Signing out of billing must never block signing out of the app.
  }
  configuredFor = null;
}

/**
 * Whether RevenueCat currently reports the entitlement.
 *
 * Used for UI only — hiding ads, showing the paywall. Paid work is authorized
 * by the server, which keeps its own copy fed by the webhook.
 */
export async function hasActiveEntitlement(): Promise<boolean> {
  if (!purchasesSupported) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active[PULSO_PLUS] !== undefined;
  } catch (error) {
    console.warn('[purchases] customer info unavailable', error);
    return false;
  }
}

export async function getAvailablePackages(): Promise<PurchasesPackage[]> {
  if (!purchasesSupported) return [];
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current?.availablePackages ?? [];
  } catch (error) {
    console.warn('[purchases] offerings unavailable', error);
    return [];
  }
}

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'failed';

export async function purchasePackage(item: PurchasesPackage): Promise<PurchaseOutcome> {
  if (!purchasesSupported) return 'failed';
  try {
    const result = await Purchases.purchasePackage(item);
    return result.customerInfo.entitlements.active[PULSO_PLUS] ? 'purchased' : 'failed';
  } catch (error) {
    // A cancelled purchase is a normal outcome, not an error to report.
    if ((error as { userCancelled?: boolean }).userCancelled) return 'cancelled';
    console.warn('[purchases] purchase failed', error);
    return 'failed';
  }
}

export async function restorePurchases(): Promise<boolean> {
  if (!purchasesSupported) return false;
  try {
    const info = await Purchases.restorePurchases();
    return info.entitlements.active[PULSO_PLUS] !== undefined;
  } catch (error) {
    console.warn('[purchases] restore failed', error);
    return false;
  }
}
