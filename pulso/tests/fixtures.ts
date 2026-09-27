// Athlete fixtures for the pure PULSO rules: new, active, recovering and
// reactivating users, plus sessions for records, comebacks and quiet days.
// Times are local and fixed so results don't depend on when tests run.

import type { TrainingExercise, TrainingSession, TrainingSetEntry } from '../src/lib/pulse-engine';

/** Wednesday 23 Sep 2026, 18:00 local — the week starts Monday 21 Sep. */
export const NOW = new Date(2026, 8, 23, 18, 0).getTime();
export const DAY = 24 * 60 * 60 * 1000;

export function daysAgo(days: number, hour = 18): number {
  const date = new Date(NOW - days * DAY);
  date.setHours(hour, 0, 0, 0);
  return date.getTime();
}

export function sets(...entries: [weightKg: number, reps: number, rpe?: number][]): TrainingSetEntry[] {
  return entries.map(([weightKg, reps, rpe]) => ({ weightKg, reps, rpe: rpe ?? 8 }));
}

export const row = (entries: TrainingSetEntry[]): TrainingExercise => ({
  exerciseId: 'ex_remo_barra', name: 'Remo con barra', muscles: ['upper_back', 'biceps', 'forearms', 'trapezius'], sets: entries,
});
export const squat = (entries: TrainingSetEntry[]): TrainingExercise => ({
  exerciseId: 'ex_sentadilla', name: 'Sentadilla', muscles: ['quadriceps', 'gluteals', 'hamstrings', 'adductors'], sets: entries,
});
export const bench = (entries: TrainingSetEntry[]): TrainingExercise => ({
  exerciseId: 'ex_press_banca', name: 'Press banca', muscles: ['chest', 'triceps', 'deltoids'], sets: entries,
});

let counter = 0;
export function session(at: number, exercises: TrainingExercise[], overrides: Partial<TrainingSession> = {}): TrainingSession {
  counter += 1;
  return {
    id: `s${counter}`,
    status: 'completed',
    kind: 'plan',
    startedAt: at - 50 * 60_000,
    finishedAt: at,
    exercises,
    ...overrides,
  };
}

export const fixtures = {
  newUser: [] as TrainingSession[],

  /** Trained Monday and Tuesday this week, steady load. */
  active: [
    session(daysAgo(8), [row(sets([55, 10], [60, 8])), bench(sets([60, 8], [60, 8]))]),
    session(daysAgo(2), [squat(sets([80, 6], [80, 6], [80, 6]))]),
    session(daysAgo(1), [row(sets([60, 8], [60, 8]))]),
  ],

  /** Three hard sessions in the last three days. */
  recovering: [
    session(daysAgo(2), [squat(sets([100, 5], [100, 5], [100, 5], [100, 5])), row(sets([60, 8], [60, 8], [60, 8]))]),
    session(daysAgo(1, 8), [bench(sets([70, 6], [70, 6], [70, 6], [70, 6])), row(sets([60, 8], [60, 8], [60, 8]))]),
    session(daysAgo(1, 19), [squat(sets([90, 8], [90, 8], [90, 8]))]),
  ],

  /** Last session 12 days ago. */
  reactivating: [
    session(daysAgo(20), [row(sets([60, 8]))]),
    session(daysAgo(12), [row(sets([60, 8], [60, 8]))]),
  ],
};
