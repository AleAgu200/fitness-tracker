export interface WorkoutWidgetData {
  workoutActive: boolean;
  currentExercise: string | null;
  nextExercise: string | null;
  weight: number | null;
  reps: number | null;
  weightUnit: 'kg' | 'lb';
  restActive: boolean;
  restLeft: number;
  /** Epoch ms when the current rest period ends. Only used by the iOS live-ticking timer. */
  restEndAt: number | null;
  restTotal: number;
  accent: string;
}

export const EMPTY_WIDGET_DATA: WorkoutWidgetData = {
  workoutActive: false,
  currentExercise: null,
  nextExercise: null,
  weight: null,
  reps: null,
  weightUnit: 'kg',
  restActive: false,
  restLeft: 0,
  restEndAt: null,
  restTotal: 0,
  accent: '#E8FF59',
};
