import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { useApp } from '@/context/app-state';
import { computeMuscleLoad, computePulseCore, MuscleLoad, PulseCore, sessionTime } from '@/lib/pulse-engine';

/** Current time, refreshed whenever the screen regains focus (keeps render pure). */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(useCallback(() => { setNow(Date.now()); }, []));
  return now;
}

export interface PulseSnapshot {
  now: number;
  core: PulseCore;
  load: MuscleLoad;
  meals: { done: number; total: number };
}

/** Núcleo state and 7-day muscle load, derived from local data on demand. */
export function usePulse(): PulseSnapshot {
  const { state } = useApp();
  const focusedAt = useNow();
  const { trainingSessions, meals, mealStatus, water, racha, plannedDaysPerWeek } = state;

  return useMemo(() => {
    // A session finished since the screen got focus still counts as "now".
    const now = trainingSessions.reduce((latest, session) => Math.max(latest, sessionTime(session)), focusedAt);
    const done = meals.filter(meal => ['cumplido', 'sustituido'].includes(mealStatus[meal.id] ?? '')).length;
    const core = computePulseCore({
      now,
      sessions: trainingSessions,
      streakDays: racha,
      plannedDaysPerWeek,
      nutritionPct: meals.length ? (done / meals.length) * 100 : null,
      hydrationPct: Math.min(100, water * 10),
    });
    return { now, core, load: computeMuscleLoad(trainingSessions, now, 7), meals: { done, total: meals.length } };
  }, [focusedAt, trainingSessions, meals, mealStatus, water, racha, plannedDaysPerWeek]);
}
