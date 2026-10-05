import * as WebBrowser from 'expo-web-browser';

import { addLaunchActionListener, getLaunchAction } from '@/modules/pulso-widget';

import { SERVER_URL } from './auth-client';

/** Public legal pages served by the PULSO server (also linked from the store listings). */
export const LEGAL_URLS = {
  privacy: `${SERVER_URL}/privacidad`,
  terms: `${SERVER_URL}/terminos`,
  deleteAccount: `${SERVER_URL}/eliminar-cuenta`,
} as const;

export function openLegal(page: keyof typeof LEGAL_URLS): void {
  WebBrowser.openBrowserAsync(LEGAL_URLS[page]).catch(() => {});
}

/**
 * Health Connect's permission dialog links to the app's privacy policy by launching it with
 * one of these actions (the alias action is used from Android 14 on).
 */
const RATIONALE_ACTIONS = new Set([
  'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE',
  'android.intent.action.VIEW_PERMISSION_USAGE',
]);

/** Opens the privacy policy whenever Health Connect asks the app to show it. Returns a cleanup. */
export function watchPrivacyRationale(): () => void {
  if (RATIONALE_ACTIONS.has(getLaunchAction() ?? '')) openLegal('privacy');
  const subscription = addLaunchActionListener(action => {
    if (RATIONALE_ACTIONS.has(action ?? '')) openLegal('privacy');
  });
  return () => subscription.remove();
}
