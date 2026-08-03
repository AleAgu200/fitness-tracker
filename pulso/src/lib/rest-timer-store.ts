import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { getWidgetRest, setWidgetRest } from '@/modules/pulso-widget';

export interface RestTimerState {
  /** Epoch ms when the current rest period ends, or null when not resting. */
  restEndAt: number | null;
  restTotal: number;
}

export const CLEARED_REST_STATE: RestTimerState = { restEndAt: null, restTotal: 0 };

const KEY = 'pulso_rest_timer_state';

/**
 * Cross-process rest timer snapshot. The running app writes to this on every
 * start/extend/reduce/skip, and the Android home-screen widget reads and mutates the
 * same record from its broadcast receiver — including while the app process is dead.
 *
 * On Android that record lives in the widget module's SharedPreferences, the only store
 * an AppWidgetProvider can reach synchronously; elsewhere it falls back to SecureStore.
 * Nothing in it is sensitive.
 */
export async function loadRestTimerState(): Promise<RestTimerState> {
  if (Platform.OS === 'android') {
    const native = getWidgetRest();
    if (native) return { restEndAt: native.restEndAt, restTotal: native.restTotal };
  }

  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return CLEARED_REST_STATE;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.restTotal !== 'number') return CLEARED_REST_STATE;
    return { restEndAt: typeof parsed.restEndAt === 'number' ? parsed.restEndAt : null, restTotal: parsed.restTotal };
  } catch {
    return CLEARED_REST_STATE;
  }
}

export async function saveRestTimerState(state: RestTimerState): Promise<void> {
  if (Platform.OS === 'android') {
    // Also repaints the widget and (re)schedules its zero-crossing alarm.
    setWidgetRest(state.restEndAt, state.restTotal);
    return;
  }
  await SecureStore.setItemAsync(KEY, JSON.stringify(state));
}
