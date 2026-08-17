export interface WorkoutWidgetSet {
  weight: number;
  reps: number;
  rpe: number;
}

export interface WorkoutWidgetData {
  /** True once the athlete has logged at least one set today — gates the "begin your
   *  training" CTA vs the active-exercise card. */
  workoutActive: boolean;
  /** True once the session is finished — takes priority over `workoutActive` in the widget. */
  sessionDone: boolean;
  currentExercise: string | null;
  /** Plan-slot id of the active exercise, so the "done" widget button can deep-link
   *  straight to logging it. */
  currentSlotId: string | null;
  nextExercise: string | null;
  nextExercises: string[];
  muscleGroup: 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'full' | null;
  weight: number | null;
  reps: number | null;
  weightUnit: 'kg' | 'lb';
  completedSets: number;
  targetSets: number;
  loggedSets: WorkoutWidgetSet[];
  sessionVolume: number;
  restActive: boolean;
  restLeft: number;
  /** Epoch ms when the current rest period ends. Only used by the iOS live-ticking timer. */
  restEndAt: number | null;
  restTotal: number;
  accent: string;
}

export const EMPTY_WIDGET_DATA: WorkoutWidgetData = {
  workoutActive: false,
  sessionDone: false,
  currentExercise: null,
  currentSlotId: null,
  nextExercise: null,
  nextExercises: [],
  muscleGroup: null,
  weight: null,
  reps: null,
  weightUnit: 'kg',
  completedSets: 0,
  targetSets: 0,
  loggedSets: [],
  sessionVolume: 0,
  restActive: false,
  restLeft: 0,
  restEndAt: null,
  restTotal: 0,
  accent: '#E8FF59',
};
