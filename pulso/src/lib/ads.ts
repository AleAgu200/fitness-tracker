import { Platform } from 'react-native';
import mobileAds, { AdsConsent, MaxAdContentRating, TestIds } from 'react-native-google-mobile-ads';

/**
 * AdMob wiring. The native SDK is NOT available in Expo Go — every export here
 * has to survive a JS-only environment, so guard on `adsSupported` before
 * touching anything that reaches native.
 *
 * App IDs live in app.json (react-native-google-mobile-ads plugin). Which tabs
 * show ads, how often and with which ad units comes from the admin panel
 * (lib/ad-config.ts, components/tab-ad-gate.tsx).
 */

// Real units are Android-only for now: there is no iOS app registered in AdMob
// yet, so iOS falls back to Google's test units (which always fill) instead of
// an ID that would just error out.

/**
 * The unit to request. `__DEV__` always uses the test unit — serving real ads to
 * yourself is a policy violation that gets accounts banned, so this must never
 * be flipped to the live ID for debugging.
 */
export function adUnitFor(format: 'interstitial' | 'rewarded_interstitial', adUnitId: string): string {
  if (__DEV__ || Platform.OS !== 'android') {
    return format === 'interstitial' ? TestIds.INTERSTITIAL : TestIds.REWARDED_INTERSTITIAL;
  }
  return adUnitId;
}

export const adsSupported = Platform.OS === 'android' || Platform.OS === 'ios';

let initPromise: Promise<void> | null = null;

/**
 * Idempotent SDK start-up. Safe to call from several places on mount: the first
 * caller does the work, everyone else awaits the same promise. Rejections are
 * swallowed into a resolved promise on purpose — a dead ad SDK must never stop
 * the app from rendering.
 */
export function initializeAds(): Promise<void> {
  if (!adsSupported) return Promise.resolve();
  if (initPromise) return initPromise;

  // Google's consent message (UMP, configured in AdMob → Privacy & messaging) must run
  // before ads load where the law requires it (EEA, UK, Switzerland). Elsewhere, or with
  // no message published, it resolves without showing anything. A failure must not block
  // ads: the SDK then serves non-personalized ads only where consent is missing.
  initPromise = AdsConsent.gatherConsent()
    .catch((e) => {
      console.warn('[ads] consent failed', e);
    })
    .then(() => mobileAds().setRequestConfiguration({
      // The app is a training/nutrition tracker used by minors in some markets,
      // so cap creatives at a general audience rating.
      maxAdContentRating: MaxAdContentRating.PG,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    }))
    .then(() => mobileAds().initialize())
    .then(() => undefined)
    .catch((e) => {
      console.warn('[ads] initialize failed', e);
    });

  return initPromise;
}
