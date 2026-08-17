import { NativeModule, requireNativeModule } from 'expo';

import type { PulsoWidgetEvents, WidgetRestState } from './PulsoWidget.types';

declare class PulsoWidgetModule extends NativeModule<PulsoWidgetEvents> {
  /** `setDetail` arrives pre-formatted (e.g. `"60.0 kg × 8"`); the widget does no formatting. */
  setWorkout(state: {
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
    accent: string | null;
  }): void;
  setRest(restEndAt: number | null, restTotal: number): void;
  getRest(): WidgetRestState;
}

export default requireNativeModule<PulsoWidgetModule>('PulsoWidget');
