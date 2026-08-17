import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

import type { WidgetRestState } from './src/PulsoWidget.types';

export type { WidgetRestState, PulsoWidgetEvents } from './src/PulsoWidget.types';

type NativeModule = typeof import('./src/PulsoWidgetModule').default;

/**
 * Android-only, and absent in Expo Go (which links no custom native modules). Resolved
 * through a lazy `require` rather than a static import because `requireNativeModule`
 * throws at import time wherever the native side isn't linked.
 */
function nativeModule(): NativeModule | null {
  if (Platform.OS !== 'android' || isRunningInExpoGo()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('./src/PulsoWidgetModule') as { default: NativeModule }).default;
  } catch {
    return null;
  }
}

let cached: NativeModule | null | undefined;

function widget(): NativeModule | null {
  if (cached === undefined) cached = nativeModule();
  return cached;
}

export function setWidgetWorkout(state: {
  workoutActive: boolean;
  sessionDone: boolean;
  currentExercise: string | null;
  currentSlotId: string | null;
  nextExercise: string | null;
  nextExercises: string | null;
  setDetail: string | null;
  setProgress: string | null;
  sessionVolume: string | null;
  setHistory: string | null;
  muscleGroup: string | null;
  accent: string;
}): void {
  widget()?.setWorkout(state);
}

/**
 * Hands the rest deadline to the widget. The native side stores it, schedules the
 * zero-crossing repaint and starts the platform Chronometer — nothing here has to tick.
 */
export function setWidgetRest(restEndAt: number | null, restTotal: number): void {
  widget()?.setRest(restEndAt, restTotal);
}

export function getWidgetRest(): WidgetRestState | null {
  const module = widget();
  if (!module) return null;
  try {
    return module.getRest();
  } catch {
    return null;
  }
}

/** Fires when a widget button moved the timer while the app was running. */
export function addWidgetRestListener(
  listener: (state: WidgetRestState) => void,
): { remove: () => void } {
  const module = widget();
  if (!module) return { remove: () => {} };
  return module.addListener('onRestChanged', listener);
}
