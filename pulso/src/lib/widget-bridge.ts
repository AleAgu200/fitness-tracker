import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

import { formatWeight } from '@/lib/units';
import { setWidgetWorkout } from '@/modules/pulso-widget';
import { pulsoEntrenoWidget } from '@/widgets/entreno-widget-registry';
import { WorkoutWidgetData } from '@/widgets/workout-widget-types';

export { EMPTY_WIDGET_DATA } from '@/widgets/workout-widget-types';
export type { WorkoutWidgetData } from '@/widgets/workout-widget-types';

interface AndroidWidgetPush {
  workoutActive: boolean;
  currentExercise: string | null;
  nextExercise: string | null;
  setDetail: string | null;
  accent: string;
}

function androidPush(data: WorkoutWidgetData): AndroidWidgetPush {
  const setDetail = data.weight != null && data.reps != null
    ? `${formatWeight(data.weight, data.weightUnit)} × ${data.reps}`
    : null;

  return {
    workoutActive: data.workoutActive,
    currentExercise: data.currentExercise,
    nextExercise: data.nextExercise,
    setDetail,
    accent: data.accent,
  };
}

let lastAndroidPush: AndroidWidgetPush | null = null;

function isSamePush(a: AndroidWidgetPush | null, b: AndroidWidgetPush): boolean {
  return a != null &&
    a.workoutActive === b.workoutActive &&
    a.currentExercise === b.currentExercise &&
    a.nextExercise === b.nextExercise &&
    a.setDetail === b.setDetail &&
    a.accent === b.accent;
}

/**
 * Pushes the exercise half of the widget state. The rest countdown is deliberately not
 * part of this: `rest-timer-store` owns the deadline, and the widget's Chronometer ticks
 * it natively, so there is nothing per-second for this path to push.
 *
 * The caller's effect still re-runs once a second while a timer is going, hence the
 * change guard — repainting a RemoteViews tree at 1 Hz for identical content would burn
 * battery and risks the launcher throttling our updates.
 */
export function syncWorkoutWidgets(data: WorkoutWidgetData): void {
  if (Platform.OS === 'android') {
    const push = androidPush(data);
    if (isSamePush(lastAndroidPush, push)) return;
    lastAndroidPush = push;
    setWidgetWorkout(push);
    return;
  }

  if (Platform.OS === 'ios' && !isRunningInExpoGo()) {
    pulsoEntrenoWidget?.updateSnapshot(data);
  }
}
