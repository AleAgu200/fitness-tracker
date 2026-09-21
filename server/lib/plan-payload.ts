import type { MealPlanPayload, WorkoutPayload } from "@/lib/assignments";

export const MAX_EXERCISES = 20;
export const MAX_MEALS = 10;

export class PlanPayloadError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

/**
 * Normalizes and clamps a plan payload before it can reach an athlete. Drafts
 * run through this on save *and* the direct assign routes run it too, so a
 * payload can never reach `assigned_*` without having been checked — a draft is
 * just a staging area, not a bypass.
 */
export function normalizeExercises(raw: unknown): WorkoutPayload["exercises"] {
  if (!Array.isArray(raw) || raw.length === 0) throw new PlanPayloadError("invalid_body");
  if (raw.length > MAX_EXERCISES) throw new PlanPayloadError("too_many_exercises");

  return (raw as Record<string, unknown>[]).map((item) => {
    const nombre = typeof item.nombre === "string" ? item.nombre.trim() : "";
    if (!nombre) throw new PlanPayloadError("invalid_exercise");
    const instructions = typeof item.instructions === "string" ? item.instructions.trim().slice(0, 2000) : null;
    const rawGifPath = typeof item.gifPath === "string" ? item.gifPath.trim().slice(0, 2048) : "";
    // Only absolute http(s) or app-relative paths — anything else (javascript:,
    // data:) would be rendered by the phone as an image source.
    const gifPath = rawGifPath && (/^https?:\/\//i.test(rawGifPath) || rawGifPath.startsWith("/"))
      ? rawGifPath
      : null;
    return {
      nombre,
      target: Math.max(1, Math.round(Number(item.target) || 3)),
      reps: Math.max(1, Math.round(Number(item.reps) || 8)),
      peso: Math.max(0, Number(item.peso) || 0),
      step: Math.max(0.5, Number(item.step) || 2.5),
      restSeconds: Math.max(15, Math.round(Number(item.restSeconds) || 90)),
      instructions: instructions || null,
      gifPath,
    };
  });
}

export function normalizeMeals(raw: unknown): MealPlanPayload["meals"] {
  if (!Array.isArray(raw) || raw.length === 0) throw new PlanPayloadError("invalid_body");
  if (raw.length > MAX_MEALS) throw new PlanPayloadError("too_many_meals");

  return (raw as Record<string, unknown>[]).map((item) => {
    const label = typeof item.label === "string" ? item.label.trim().toUpperCase() : "";
    const n = typeof item.n === "string" ? item.n.trim() : "";
    if (!label || !n) throw new PlanPayloadError("invalid_meal");
    const items = Array.isArray(item.items)
      ? (item.items as Record<string, unknown>[])
          .filter(entry => typeof entry.name === "string" && Number(entry.grams) > 0)
          .map(entry => ({
            foodId: typeof entry.foodId === "string" ? entry.foodId : "",
            name: (entry.name as string).trim(),
            grams: Math.round(Number(entry.grams)),
          }))
      : undefined;
    return {
      label,
      time: typeof item.time === "string" ? item.time.trim() : "",
      n,
      kcal: Math.max(0, Math.round(Number(item.kcal) || 0)),
      p: Math.max(0, Math.round(Number(item.p) || 0)),
      c: Math.max(0, Math.round(Number(item.c) || 0)),
      g: Math.max(0, Math.round(Number(item.g) || 0)),
      items,
    };
  });
}

/** Normalize a whole draft payload for either discipline. */
export function normalizePlanPayload(discipline: "coach" | "nutritionist", payload: unknown): unknown {
  const record = (payload ?? {}) as Record<string, unknown>;
  if (discipline === "coach") {
    return {
      coachName: typeof record.coachName === "string" ? record.coachName : "",
      exercises: normalizeExercises(record.exercises),
    } satisfies WorkoutPayload;
  }
  return {
    nutritionistName: typeof record.nutritionistName === "string" ? record.nutritionistName : "",
    meals: normalizeMeals(record.meals),
  } satisfies MealPlanPayload;
}
