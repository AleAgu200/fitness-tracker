// Pulls professional assignments (workout / meal plan) from the server and
// applies them onto the local SQLite tables. The phone stays usable offline;
// sync is opportunistic at app load.

import * as SecureStore from 'expo-secure-store';

import { DAYS_PER_WEEK, replaceWeekMealSlots } from '@/db/nutrition';
import { AssignedExercise, replacePlanExercises } from '@/db/plan';
import { apiFetch } from './api';

interface WorkoutAssignment {
  version: number;
  payload: { coachName: string; exercises: AssignedExercise[] };
}

interface MealPlanAssignment {
  version: number;
  payload: {
    nutritionistName: string;
    meals: { label: string; time: string; n: string; kcal: number; p: number; c: number; g: number }[];
  };
}

export interface SyncResult {
  workoutBy: string | null;
  mealsBy: string | null;
  workoutChanged: boolean;
  mealsChanged: boolean;
}

const kv = {
  get: (k: string) => SecureStore.getItemAsync(k).catch(() => null),
  set: (k: string, v: string) => SecureStore.setItemAsync(k, v).catch(() => {}),
  del: (k: string) => SecureStore.deleteItemAsync(k).catch(() => {}),
};

const keys = (uid: string) => ({
  wVersion: `pulso_aw_v_${uid}`,
  wBy: `pulso_aw_by_${uid}`,
  mVersion: `pulso_amp_v_${uid}`,
  mBy: `pulso_amp_by_${uid}`,
});

/** Last-known assignment authors, for offline attribution banners. */
export async function getStoredAssignmentMeta(userId: string): Promise<{ workoutBy: string | null; mealsBy: string | null }> {
  const k = keys(userId);
  return {
    workoutBy: await kv.get(k.wBy),
    mealsBy: await kv.get(k.mBy),
  };
}

export async function syncAssignments(
  userId: string,
  templateId: string,
  mealPlanId: string,
): Promise<SyncResult> {
  const res = await apiFetch<{ workout: WorkoutAssignment | null; mealPlan: MealPlanAssignment | null }>(
    '/api/assignments',
  );
  const k = keys(userId);
  const result: SyncResult = { workoutBy: null, mealsBy: null, workoutChanged: false, mealsChanged: false };

  if (res.workout) {
    result.workoutBy = res.workout.payload.coachName || 'tu coach';
    const applied = Number(await kv.get(k.wVersion)) || 0;
    if (res.workout.version > applied) {
      await replacePlanExercises(userId, templateId, res.workout.payload.exercises);
      await kv.set(k.wVersion, String(res.workout.version));
      result.workoutChanged = true;
    }
    await kv.set(k.wBy, result.workoutBy);
  } else {
    await kv.del(k.wBy);
  }

  if (res.mealPlan) {
    result.mealsBy = res.mealPlan.payload.nutritionistName || 'tu nutricionista';
    const applied = Number(await kv.get(k.mVersion)) || 0;
    if (res.mealPlan.version > applied) {
      // A nutritionist still assigns a single daily template. Applying it to
      // every weekday keeps that meaning intact now that plans are per-day,
      // instead of leaving six days empty.
      const assigned = res.mealPlan.payload.meals.map(m => ({
        label: m.label,
        time: m.time,
        n: m.n,
        kcal: m.kcal,
        p: m.p,
        c: m.c,
        g: m.g,
      }));
      await replaceWeekMealSlots(
        mealPlanId,
        Array.from({ length: DAYS_PER_WEEK }, (_, i) => ({ weekday: i + 1, meals: assigned })),
      );
      await kv.set(k.mVersion, String(res.mealPlan.version));
      result.mealsChanged = true;
    }
    await kv.set(k.mBy, result.mealsBy);
  } else {
    await kv.del(k.mBy);
  }

  return result;
}
